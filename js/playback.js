function renderFs() {
  [$('fsChips'), $('pChips')].forEach(box => {
  box.innerHTML = '';
  sections.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'sc' + (s.id === activeId ? ' active' : '') + (s.off ? ' off' : '') + (s.col ? ' col' : '');
    if (s.col) el.style.setProperty('--c', s.col);
    el.innerHTML = '<button class="chk" aria-pressed="' + !s.off + '" aria-label="' + tr('Incluir na reprodução') + '">' + ico('check') + '</button><button class="nm"></button>';
    el.querySelector('.nm').innerHTML = '';
    el.querySelector('.nm').append(s.name);
    const sm = document.createElement('small'); sm.textContent = fmt(s.a); el.querySelector('.nm').append(sm);
    el.querySelector('.chk').onclick = () => { s.off = !s.off; store(); renderAll(); };
    el.querySelector('.nm').onclick = () => useSection(s);
    box.appendChild(el);
  });
  });
}

function playIndex(i, withCount) {
  const s = queue.list[i];
  activeId = s.id; $('a').value = s.a; $('b').value = s.b;
  stopAt = s.b; holdUntil = Date.now() + 800;
  renderAll();
  const go = () => { holdUntil = Date.now() + 800; seekTo(s.a); player.playVideo(); };
  withCount ? countdownThen(go) : go();
}

function playQueue(startId) {
  if (!player) return;
  const list = sections.filter(x => !x.off);
  if (!list.length) return toast('Seleciona pelo menos uma secção.', 'err');
  const i = Math.max(0, list.findIndex(x => x.id === startId));
  queue = { list, i };
  playIndex(i, true);
}

function advanceQueue() {
  if (queue.i + 1 < queue.list.length) { queue.i++; playIndex(queue.i, false); }
  else if (loopOn) { queue.i = 0; playIndex(0, true); }
  else { queue = null; stopAt = null; player.pauseVideo(); }
}

function step(dir) {
  if (!player) return;
  const list = sections.filter(x => !x.off);
  if (!list.length) return;
  let i = list.findIndex(x => x.id === activeId);
  if (i < 0) i = dir > 0 ? -1 : list.length;
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  queue = { list, i: j };
  playIndex(j, false);
}

function toggleFullscreen() {
  const st = $('stage');
  const real = document.fullscreenElement || document.webkitFullscreenElement;
  const pseudo = () => { st.classList.add('pfs', 'fs'); document.body.style.overflow = 'hidden'; poke(); };
  if (real) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  if (st.classList.contains('pfs')) { st.classList.remove('pfs', 'fs'); document.body.style.overflow = ''; return poke(); }
  const req = st.requestFullscreen || st.webkitRequestFullscreen;
  if (!req) return pseudo();
  const pr = req.call(st);
  if (pr && pr.catch) pr.catch(pseudo);
}
const onFs = () => {
  const st = $('stage');
  st.classList.toggle('fs', !!(document.fullscreenElement || document.webkitFullscreenElement) || st.classList.contains('pfs'));
  poke();
};
document.addEventListener('fullscreenchange', onFs);
document.addEventListener('webkitfullscreenchange', onFs);

let idleT;
function poke() {
  const st = $('stage');
  st.classList.remove('idle'); clearTimeout(idleT);
  if (st.classList.contains('fs')) idleT = setTimeout(() => {
    if (player && player.getPlayerState && player.getPlayerState() === 1) st.classList.add('idle');
  }, 3000);
}
['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, poke, { passive: true }));
$('shield').onclick = () => toggle();
$('shield').ondblclick = toggleFullscreen;

function useSection(s) {
  if (!player) return;
  queue = null;
  activeId = s.id; $('a').value = s.a; $('b').value = s.b;
  stopAt = s.b;
  renderAll();
  countdownThen(() => { seekTo(s.a); player.playVideo(); });
}

function saveSection() {
  if (!videoId || B() <= A()) return;
  const s = { id: Date.now(), name: tr('Secção {0}', sections.length + 1), a: A(), b: B() };
  sections.push(s); activeId = s.id; store(); renderAll();
}

const sig = () => JSON.stringify(sections.map(x => [x.name, x.a, x.b, x.note || '', !!x.off]));
async function addSections(list, silent) {
  if (!list.length) return toast('Não foi possível criar secções.', 'err');
  if (sections.length && !silent && !(await ask('Substituir as secções existentes?', 'Substituir'))) return false;
  sections = list.map((x, i) => ({ id: Date.now() + i, name: x.name.replace(/^Parte (\d+)$/, (m, n) => tr('Parte {0}', n)).replace(/^Parte$/, () => tr('Parte')), a: x.a, b: x.b }));
  activeId = null;
  const end = Math.max(...sections.map(x => x.b));
  if (end > duration) duration = end;
  if (!+$('b').value) $('b').value = duration.toFixed(1);
  store(); renderAll(); lastSig = sig();
  return true;
}

async function autoSplit(audio) {
  if (!videoId) return toast('Carrega um vídeo primeiro.', 'err');
  const msg = $('autoMsg'), btn = $('auto');
  btn.disabled = true; btn.classList.add('busy'); msg.textContent = tr('A analisar o vídeo… pode demorar uns segundos.');
  try {
    const sens = +$('sens').value / 100;
    const j = await api('/analyze?v=' + videoId + (audio ? '&mode=audio&s=' + sens : ''));
    const ok = await addSections(j.sections, audio && lastSig === sig());
    if (ok !== false) {
      msg.textContent = tr('Fonte: {0} · {1} secções.', tr(j.source), j.sections.length);
      $('sensRow').hidden = false;
    } else msg.textContent = '';
  } catch (e) {
    msg.textContent = e.message === 'offline' ? tr(OFFLINE) : tr('Falhou: {0}', e.message);
  }
  btn.disabled = false; btn.classList.remove('busy');
}

function parseTimestamps() {
  if (!player) return toast('Carrega um vídeo primeiro.', 'err');
  if (!duration) duration = player.getDuration() || 0;
  if (!duration) return toast('Dá play ao vídeo uma vez primeiro, para eu saber a duração.', 'err');
  const found = [];
  $('ts').value.split('\n').forEach(line => {
    const m = line.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
    if (!m) return;
    const t = (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3];
    const name = line.replace(m[0], '').replace(/^[\s\-–—:•.)\]]+|[\s\-–—:(\[]+$/g, '') || 'Parte';
    found.push({ name, a: t });
  });
  found.sort((x, y) => x.a - y.a);
  addSections(found.map((f, i) => ({ name: f.name, a: f.a, b: i + 1 < found.length ? found[i + 1].a : duration })).filter(x => x.b > x.a));
}

const setA = () => { if (!player) return; $('a').value = player.getCurrentTime().toFixed(1); activeId = null; renderAll(); };
const setB = () => { if (!player) return; $('b').value = player.getCurrentTime().toFixed(1); activeId = null; renderAll(); };
const toggleLoop = () => { loopOn = !loopOn; setPressed($('loop'), loopOn); setPressed($('fsLoop'), loopOn); setPressed($('mLoop'), loopOn); };
function setRate(r) {
  r = Math.min(1.5, Math.max(0.25, +r.toFixed(2)));
  $('rate').value = r; $('rateLbl').textContent = r.toFixed(2) + '×'; $('mRate').textContent = r + '×';
  document.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', +b.dataset.r === r));
  player && player.setPlaybackRate(r);
}
const toggle = () => { stopAt = null; queue = null; return player && (player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo()); };

const cleanSections = arr => (Array.isArray(arr) ? arr : []).map((x, i) => {
  const o = { id: Date.now() + i, name: String(x.name ?? tr('Secção')).slice(0, 80) || tr('Secção'), a: +x.a, b: +x.b };
  if (x.note) o.note = String(x.note).slice(0, 2000);
  if (x.off) o.off = true;
  if (x.st === 'work' || x.st === 'done') o.st = x.st;
  if (PALETTE.includes(x.col)) o.col = x.col;
  return o;
}).filter(x => isFinite(x.a) && isFinite(x.b) && x.a >= 0 && x.b > x.a);

const b64e = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = t => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
