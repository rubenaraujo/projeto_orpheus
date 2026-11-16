let descFor = null;
function esc(x) { return x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
async function loadDesc() {
  if (!videoId || descFor === videoId) return;
  const id = videoId, box = $('descBody');
  box.textContent = tr('A carregar a descrição…');
  try {
    const j = await api('/info?v=' + id);
    if (id !== videoId) return;
    descFor = id;
    let html = esc(j.description || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$)/gm, (m, p, t) => p + '<button class="tsl" data-t="' + t + '">' + t + '</button>');
    box.innerHTML = (j.title ? '<b>' + esc(j.title) + (j.channel ? ' · ' + esc(j.channel) : '') + '</b>' : '') + (html.trim() ? html : esc(tr('Este vídeo não tem descrição.')));
  } catch (e) { box.textContent = e.message === 'offline' ? tr(OFFLINE) : tr('Falhou: {0}', e.message); }
}
$('desc').addEventListener('toggle', () => { if ($('desc').open) loadDesc(); });
$('descBody').addEventListener('click', e => {
  const b = e.target.closest('.tsl'); if (!b || !player) return;
  seekTo(b.dataset.t.split(':').reduce((a, x) => a * 60 + +x, 0)); player.playVideo();
});
function loadVideo(id) {
  videoId = id; descFor = null;
  document.body.classList.add('has-video');
  zoom.z = 1; zoom.s = 0; story = null; loadStory(id);
  if ($('desc').open) loadDesc(); else $('descBody').textContent = '';
  localStorage.setItem('looper:last', id);
  sections = JSON.parse(localStorage.getItem(key()) || '[]');
  notesOpen.clear();
  activeId = null; loopOn = false; setPressed($('loop'), false); setPressed($('fsLoop'), false); setPressed($('mLoop'), false);
  ccOn = false; setPressed($('ccBtn'), false); queue = null; lastSig = null; $('sensRow').hidden = true; $('autoMsg').textContent = '';
  $('a').value = 0; $('b').value = 0; duration = 0;
  if (player) { player.loadVideoById(id); return renderAll(); }
  const origin = location.protocol.startsWith('http') ? { origin: location.origin } : {};
  player = new YT.Player('yt', {
    videoId: id,
    playerVars: { rel:0, playsinline:1, fs:0, controls:0, disablekb:1, iv_load_policy:3, cc_load_policy:0, ...origin },
    events: {
      onReady: () => { applyVolume(); syncTitle(); duration = player.getDuration() || duration; renderAll(); },
      onError: e => toast(tr({ 2: 'Link inválido.', 100: 'Vídeo não encontrado ou privado.', 101: 'O autor não permite incorporar este vídeo.', 150: 'O autor não permite incorporar este vídeo.', 153: 'Abre a página por http://localhost e não como ficheiro.' }[e.data] || 'Não foi possível carregar o vídeo.'), 'err'),
      onStateChange: e => {
        if (e.data === YT.PlayerState.PLAYING) {
          const d = player.getDuration();
          if (d !== duration) { duration = d; if (!+$('b').value) $('b').value = d.toFixed(1); renderAll(); }
          player.setPlaybackRate(+$('rate').value);
          player.setPlaybackQuality('highres');
          applyCaptions(); applyVolume();
          syncTitle();
        }
        ['play', 'fsPlay', 'mPlay'].forEach(id => {
          $(id).innerHTML = ico(e.data === 1 ? 'pause' : 'play');
          $(id).setAttribute('aria-label', tr(e.data === 1 ? 'Pausa' : 'Play'));
        });
        if (e.data === YT.PlayerState.ENDED) { stopAt = null; queue = null; player.seekTo(0, true); player.pauseVideo(); }
        if (!counting) renderAll();
      }
    }
  });
}

let vol = +(localStorage.getItem('looper:vol') ?? 100), muted = false;
function applyVolume() {
  ['vol', 'fsVol'].forEach(id => $(id).value = vol);
  ['mute', 'fsMute'].forEach(id => $(id).innerHTML = ico(muted || vol === 0 ? 'mute' : 'vol'));
  if (player && player.setVolume) { player.setVolume(vol); muted || vol === 0 ? player.mute() : player.unMute(); }
}
function setVol(v) { vol = Math.min(100, Math.max(0, +v)); muted = false; localStorage.setItem('looper:vol', vol); applyVolume(); }
const toggleMute = () => { muted = !muted; applyVolume(); };

function applyCaptions() {
  try {
    ['captions', 'cc'].forEach(m => ccOn ? player.loadModule(m) : player.unloadModule(m));
  } catch (e) {}
}
const toggleCC = () => { ccOn = !ccOn; setPressed($('ccBtn'), ccOn); player && applyCaptions(); };

const A = () => parseFloat($('a').value) || 0;
const B = () => parseFloat($('b').value) || duration;
const seekTo = t => player.seekTo(Math.max(0, t), true);

async function countdownThen(fn) {
  if (!countOn) return fn();
  counting = true; player.pauseVideo();
  const el = $('count'); el.style.display = 'grid';
  for (let n = 3; n >= 1; n--) {
    el.textContent = n; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    await new Promise(r => setTimeout(r, 700));
  }
  el.style.display = 'none'; counting = false; fn();
}

function restartLoop() {
  countdownThen(() => { seekTo(A()); player.playVideo(); });
}

setInterval(() => {
  if (!player || !player.getCurrentTime || counting) return;
  const t = player.getCurrentTime();
  $('time').innerHTML = $('fsTime').innerHTML = '<b>' + fmt(t) + '</b> / ' + fmt(duration);
  if (player.getPlayerState() !== 1) $('stage').classList.remove('idle');
  if (duration) {
    curT = t; placeHead(t);
    if (zoom.z > 1 && player.getPlayerState() === 1) {
      const w = duration / zoom.z;
      if (t < zoom.s || t > zoom.s + w * 0.92) { zoom.s = clampS(t - w * 0.08); layoutTl(); }
    }
  }
  if (stopAt !== null && Date.now() > holdUntil && player.getPlayerState() === 1 && t >= stopAt - 0.05) {
    if (queue) advanceQueue();
    else if (loopOn) restartLoop();
    else { stopAt = null; player.pauseVideo(); }
    return;
  }
  if (stopAt === null && loopOn && B() > A() && player.getPlayerState() === 1 && t >= B() - 0.05) restartLoop();
}, 50);

const zoom = { z: 1, s: 0 };
let curT = 0, story = null;
const tlView = id => id === 'timeline' && duration ? { s: zoom.s, w: duration / zoom.z } : { s: 0, w: duration || 1 };
const clampS = s => Math.max(0, Math.min((duration || 0) - (duration || 0) / zoom.z, s));
const tNext = s => sections.filter(x => x !== s && x.a >= s.b - 0.05).sort((p, q) => p.a - q.a)[0];
const tPrev = s => sections.filter(x => x !== s && x.b <= s.a + 0.05).sort((p, q) => q.b - p.b)[0];
