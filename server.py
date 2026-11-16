"""Servidor local do Orpheus: serve a página, sugere secções, pesquisa vídeos e guarda os dados.

Uso: .venv/bin/python server.py [porta]
"""
import json, os, re, subprocess, sys, tempfile, glob, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import numpy as np
import imageio_ffmpeg
from concurrent.futures import ThreadPoolExecutor
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

ROOT = os.path.dirname(os.path.abspath(__file__))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 11025
CACHE = {}

TS = re.compile(r'(?:(\d+):)?(\d{1,2}):(\d{2})')


def timestamps_from_text(text, duration):
    found = []
    for line in (text or '').splitlines():
        m = TS.search(line)
        if not m:
            continue
        t = (int(m[1] or 0)) * 3600 + int(m[2]) * 60 + int(m[3])
        name = re.sub(r'^[\s\-–—:•.)\]]+|[\s\-–—:(\[]+$', '', TS.sub('', line, 1)) or 'Parte'
        found.append((t, name))
    found = sorted(set(found))
    out = []
    for i, (t, name) in enumerate(found):
        end = found[i + 1][0] if i + 1 < len(found) else duration
        if end > t:
            out.append({'name': name, 'a': t, 'b': end})
    return out


def decode(path):
    raw = subprocess.run(
        [FFMPEG, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def features(y, win=2048, hop=1024, bands=40):
    """Log-energia por banda (escala ~mel) + chroma, uma coluna por janela."""
    n = 1 + (len(y) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    spec = np.abs(np.fft.rfft(y[idx] * np.hanning(win), axis=1)) ** 2
    freqs = np.fft.rfftfreq(win, 1 / SR)
    edges = np.geomspace(60, SR / 2 - 1, bands + 1)
    mel = np.stack([spec[:, (freqs >= lo) & (freqs < hi)].sum(1) for lo, hi in zip(edges[:-1], edges[1:])], 1)
    mel = np.log1p(mel * 1e3)
    sel = (freqs >= 80) & (freqs < 2000)
    pitch = 12 * np.log2(freqs[sel] / 440.0) + 69
    chroma = np.zeros((n, 12))
    for c in range(12):
        chroma[:, c] = spec[:, sel][:, np.round(pitch).astype(int) % 12 == c].sum(1)
    chroma = np.log1p(chroma * 1e3)
    f = np.hstack([mel, chroma])
    f = (f - f.mean(0)) / (f.std(0) + 1e-6)
    return f, hop / SR


def novelty(y, kernel_s=6.0):
    f, dt = features(y)
    step = max(1, int(round(0.5 / dt)))  # agrega para ~0.5 s
    m = (len(f) // step) * step
    f = f[:m].reshape(-1, step, f.shape[1]).mean(1)
    dt *= step
    n = len(f)
    norm = f / (np.linalg.norm(f, axis=1, keepdims=True) + 1e-9)
    ssm = norm @ norm.T
    k = max(2, int(kernel_s / dt))
    g = np.exp(-(np.arange(-k, k) + 0.5) ** 2 / (2 * (k / 2) ** 2))
    kern = np.outer(g, g) * np.sign(np.arange(-k, k) + 0.5)[:, None] * np.sign(np.arange(-k, k) + 0.5)[None, :]
    pad = np.pad(ssm, k, mode='edge')
    nov = np.zeros(n)
    for i in range(n):
        nov[i] = (pad[i:i + 2 * k, i:i + 2 * k] * kern).sum()
    return np.maximum(nov, 0), dt, len(y) / SR


def pick(nov, dt, total, sens=0.5, min_len=6.0):
    """sens 0..1: mais alto = limiar mais baixo = mais secções."""
    n = len(nov)
    thr = nov.mean() + (1.0 + (0.5 - sens) * 3.0) * nov.std()
    min_gap = int(max(4.0, min_len + (0.5 - sens) * 16.0) / dt)
    peaks = []
    for i in np.argsort(-nov):
        if nov[i] < thr:
            break
        if i < min_gap or i > n - min_gap:
            continue
        if all(abs(i - p) >= min_gap for p in peaks):
            peaks.append(i)
    bounds = [0.0] + sorted(p * dt for p in peaks) + [total]
    return [{'name': f'Parte {i + 1}', 'a': round(float(a), 1), 'b': round(float(b), 1)}
            for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:]))]


AUDIO = {}
INFO = {}


def video_info(vid):
    if vid not in INFO:
        with YoutubeDL({'quiet': True, 'no_warnings': True, 'noplaylist': True, 'skip_download': True}) as ydl:
            i = ydl.extract_info(f'https://www.youtube.com/watch?v={vid}', download=False)
        sbs = [f for f in i.get('formats') or [] if str(f.get('format_id', '')).startswith('sb') and f.get('fragments')]
        sb = max(sbs, key=lambda f: f.get('width') or 0, default=None)
        story = None
        if sb and all(sb.get(k) for k in ('width', 'height', 'rows', 'columns', 'fps')):
            story = {'w': sb['width'], 'h': sb['height'], 'rows': sb['rows'], 'cols': sb['columns'], 'fps': sb['fps'],
                     'urls': [fr['url'] for fr in sb['fragments']]}
        INFO[vid] = {'title': i.get('title'), 'channel': i.get('channel') or i.get('uploader'),
                     'description': i.get('description') or '', 'story': story}
    return INFO[vid]


def analyze(vid, sens=0.5, audio=False):
    if audio and vid in AUDIO:
        nov, dt, total = AUDIO[vid]
        return {'source': 'análise do áudio', 'sections': pick(nov, dt, total, sens)}
    if not audio and vid in CACHE:
        return CACHE[vid]
    url = f'https://www.youtube.com/watch?v={vid}'
    with tempfile.TemporaryDirectory() as tmp:
        opts = {'quiet': True, 'noprogress': True, 'no_warnings': True, 'format': 'bestaudio/best',
                'outtmpl': os.path.join(tmp, 'a.%(ext)s'), 'noplaylist': True}
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            duration = info.get('duration') or 0
            chapters = [{'name': c.get('title') or 'Parte', 'a': c['start_time'], 'b': c['end_time']}
                        for c in info.get('chapters') or []]
            if len(chapters) >= 3 and not audio:
                res = {'source': 'capítulos do vídeo', 'sections': chapters}
            else:
                from_desc = timestamps_from_text(info.get('description'), duration)
                if len(from_desc) >= 3 and not audio:
                    res = {'source': 'tempos na descrição', 'sections': from_desc}
                else:
                    ydl.download([url])
                    path = glob.glob(os.path.join(tmp, 'a.*'))[0]
                    AUDIO[vid] = novelty(decode(path))
                    nov, dt, total = AUDIO[vid]
                    res = {'source': 'análise do áudio', 'sections': pick(nov, dt, total, sens)}
    if not audio:
        CACHE[vid] = res
    return res


CHORD = re.compile(r'(?<![A-Za-z])[A-G][#b]?(?:m|maj|min|sus|dim|aug|add)?\d{0,2}(?![A-Za-z])')
CHORD_WORDS = re.compile(r'\b(chords?|acordes?|cifra|tabs?|tablature|tablatura|fingering|dedilhado|strumming)\b', re.I)
LESSON_WORDS = re.compile(r'\b(lesson|tutorial|how to play|learn|aula|como tocar|passo a passo|for beginners|iniciantes|slow)\b', re.I)
SLOW_WORDS = re.compile(r'\b(slow|slowly|slow ?motion|lento|devagar)\b', re.I)
SEARCH_CACHE = {}


def rate(info):
    desc = info.get('description') or ''
    title = info.get('title') or ''
    duration = info.get('duration') or 0
    chapters = info.get('chapters') or []
    ts = timestamps_from_text(desc, duration)
    height = max([f.get('height') or 0 for f in info.get('formats') or []] or [0])
    views, likes = info.get('view_count') or 0, info.get('like_count')
    chord_lines = sum(1 for ln in desc.splitlines() if len(CHORD.findall(ln)) >= 3)
    has_chords = bool(CHORD_WORDS.search(title + ' ' + desc)) or chord_lines >= 2
    structure = 'capítulos' if len(chapters) >= 3 else ('descrição' if len(ts) >= 3 else None)

    why = []
    if structure: why.append(('Secções do autor (' + structure + ')', 35))
    if height >= 1080: why.append(('Resolução ' + str(height) + 'p', 20))
    elif height >= 720: why.append(('Resolução ' + str(height) + 'p', 12))
    if has_chords: why.append(('Acordes ou tablatura', 20))
    if LESSON_WORDS.search(title): why.append(('Título de aula', 8))
    if SLOW_WORDS.search(title + ' ' + desc): why.append(('Versão lenta', 5))
    if 120 <= duration <= 1800: why.append(('Duração adequada', 5))
    if likes and views and likes / views >= 0.02: why.append(('Boa taxa de gostos', 7))
    score = sum(p for _, p in why)
    return {
        'id': info['id'], 'title': title, 'channel': info.get('channel') or info.get('uploader'),
        'duration': duration, 'views': views, 'height': height,
        'structure': structure, 'chords': has_chords, 'score': min(100, score), 'why': why,
    }


def search(q, n=20):
    q = q.strip()
    if not re.search(r'guitar|guitarra|violão|violao', q, re.I):
        q += ' guitar tutorial'
    if q in SEARCH_CACHE:
        return SEARCH_CACHE[q]
    with YoutubeDL({'quiet': True, 'no_warnings': True, 'extract_flat': True}) as ydl:
        entries = ydl.extract_info(f'ytsearch{n}:{q}', download=False).get('entries') or []
    ids = [e['id'] for e in entries if e.get('id') and (e.get('duration') or 0) < 3600]

    def one(vid):
        try:
            with YoutubeDL({'quiet': True, 'no_warnings': True, 'noplaylist': True}) as ydl:
                return rate(ydl.extract_info(f'https://www.youtube.com/watch?v={vid}', download=False))
        except Exception:
            return None

    with ThreadPoolExecutor(8) as pool:
        out = [r for r in pool.map(one, ids) if r]
    out.sort(key=lambda r: -r['score'])
    SEARCH_CACHE[q] = out
    return out


YTDLP_HINT = 'O YouTube recusou o pedido. Atualiza o yt-dlp: .venv/bin/python -m pip install -U yt-dlp'
DATA = os.path.join(ROOT, 'data.json')
# só estes ficheiros (e js/*.js) são servidos; não expõe server.py nem data.json
STATIC = {'index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', 'logo.png', 'mark.png', 'icon-192.png', 'icon-512.png'}
DATA_LOCK = threading.Lock()


def same_origin(h):
    o = h.headers.get('Origin')
    return not o or urlparse(o).netloc == h.headers.get('Host')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def reply(self, body, code=200):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if urlparse(self.path).path != '/store' or not same_origin(self):
            return self.reply({'error': 'não permitido'}, 403)
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n > 20_000_000:
                raise ValueError('demasiado grande')
            body = json.loads(self.rfile.read(n))
            if not isinstance(body, dict):
                raise ValueError('formato inválido')
            with DATA_LOCK, open(DATA, 'w') as f:
                json.dump(body, f)
            self.reply({'ok': True})
        except Exception as e:
            self.reply({'error': str(e)[:200]}, 400)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/store':
            if not same_origin(self):
                return self.reply({'error': 'não permitido'}, 403)
            with DATA_LOCK:
                try:
                    with open(DATA) as f:
                        return self.reply(json.load(f))
                except FileNotFoundError:
                    return self.reply({})
        if u.path == '/health':
            return self.reply({'ok': True})
        if u.path in ('/analyze', '/search', '/info'):
            qs = {k: v[0] for k, v in parse_qs(u.query).items()}
            try:
                if u.path == '/search':
                    if not qs.get('q', '').strip():
                        raise ValueError('pesquisa vazia')
                    return self.reply({'results': search(qs['q'])})
                vid = qs.get('v', '')
                if not re.fullmatch(r'[\w-]{11}', vid):
                    raise ValueError('id inválido')
                if u.path == '/info':
                    return self.reply(video_info(vid))
                sens = min(1.0, max(0.0, float(qs.get('s', 0.5))))
                return self.reply(analyze(vid, sens, qs.get('mode') == 'audio'))
            except DownloadError:
                return self.reply({'error': YTDLP_HINT}, 502)
            except ValueError as e:
                return self.reply({'error': str(e)}, 400)
            except Exception as e:
                return self.reply({'error': str(e)[:300]}, 500)
        name = u.path.lstrip('/')
        if name in STATIC or name == '' or re.fullmatch(r'js/\w+\.js', name):
            return super().do_GET()
        self.send_error(404)


if __name__ == '__main__':
    port = int(next((a for a in sys.argv[1:] if a.isdigit()), 8765))
    lan = '--lan' in sys.argv or os.environ.get('ORPHEUS_LAN') == '1'
    print(f'http://localhost:{port}')
    if lan:
        import socket
        try:
            sk = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); sk.connect(('8.8.8.8', 80))
            print(f'Rede local: http://{sk.getsockname()[0]}:{port}  (sem autenticação: usa só numa rede de confiança)')
        except OSError:
            pass
    ThreadingHTTPServer(('0.0.0.0' if lan else '127.0.0.1', port), Handler).serve_forever()
