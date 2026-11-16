$('play').onclick = toggle;
$('back').onclick = () => player && seekTo(player.getCurrentTime() - 5);
$('fwd').onclick = () => player && seekTo(player.getCurrentTime() + 5);
$('setA').onclick = setA; $('setB').onclick = setB;
$('a').onchange = $('b').onchange = () => { activeId = null; renderAll(); };
$('loop').onclick = $('fsLoop').onclick = toggleLoop;
$('fsPlay').onclick = toggle;
$('vol').oninput = $('fsVol').oninput = e => setVol(e.target.value);
$('mute').onclick = $('fsMute').onclick = toggleMute;
$('prev').onclick = $('fsPrev').onclick = () => step(-1);
$('next').onclick = $('fsNext').onclick = () => step(1);
$('fs').onclick = $('fsExit').onclick = toggleFullscreen;
$('playSel').onclick = $('fsPlaySel').onclick = () => playQueue();
$('selAll').onclick = () => { const all = sections.every(x => !x.off); sections.forEach(x => x.off = all); store(); renderAll(); };
$('ccBtn').onclick = toggleCC;
$('countBtn').onclick = () => { countOn = !countOn; setPressed($('countBtn'), countOn); };
$('save').onclick = saveSection;
$('clear').onclick = async () => {
  if (sections.length && await ask(tr('Apagar todas as {0} secções deste vídeo?', sections.length), 'Apagar', true)) {
    sections = []; activeId = null; stopAt = null; queue = null; store(); renderAll();
  }
};
$('auto').onclick = () => autoSplit(false);
$('sens').onchange = () => autoSplit(true);
$('split').onclick = splitHere;
$('parse').onclick = parseTimestamps;
$('rate').oninput = e => setRate(+e.target.value);
document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => setRate(+b.dataset.r));
['timeline', 'fsTimeline'].forEach(id => $(id).onclick = e => {
  if (!player || !duration) return;
  const r = $(id).getBoundingClientRect(), v = tlView(id);
  stopAt = null; queue = null;
  seekTo(v.s + (e.clientX - r.left) / r.width * v.w);
});

const toggleSide = () => {
  const on = !document.body.classList.contains('side-off');
  document.body.classList.toggle('side-off', on); setPressed($('sideBtn'), on); localStorage.setItem('looper:side', on ? '1' : '');
};
const togglePractice = () => {
  const on = !document.body.classList.contains('practice');
  document.body.classList.toggle('practice', on); setPressed($('focusBtn'), on); layoutTl();
};
if (localStorage.getItem('looper:side')) { document.body.classList.add('side-off'); setPressed($('sideBtn'), true); }
$('sideBtn').onclick = toggleSide;
$('focusBtn').onclick = togglePractice;
$('helpBtn').onclick = () => $('keysDlg').showModal();

$('zSec').onclick = zoomSection;
$('zIn').onclick = () => setZoom(zoom.z * 1.6);
$('zOut').onclick = () => setZoom(zoom.z / 1.6);
$('zmap').onclick = e => {
  const r = $('zmap').getBoundingClientRect();
  zoom.s = clampS((e.clientX - r.left) / r.width * duration - duration / zoom.z / 2); layoutTl();
};
$('timeline').addEventListener('wheel', e => {
  if (!duration) return;
  const r = $('timeline').getBoundingClientRect(), v = tlView('timeline');
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(zoom.z * (e.deltaY < 0 ? 1.25 : 0.8), v.s + (e.clientX - r.left) / r.width * v.w);
  } else if (zoom.z > 1 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault(); zoom.s = clampS(zoom.s + e.deltaX / r.width * v.w); layoutTl();
  }
}, { passive: false });
$('timeline').addEventListener('pointermove', e => { if (e.pointerType !== 'touch') showTip(e); });
$('timeline').addEventListener('pointerleave', hideTip);
$('timeline').addEventListener('pointerdown', hideTip);

$('mPlay').onclick = toggle;
$('mPrev').onclick = () => step(-1);
$('mNext').onclick = () => step(1);
$('mLoop').onclick = toggleLoop;
$('mRate').onclick = () => { const r = +$('rate').value; setRate(r > 0.9 ? 0.75 : r > 0.6 ? 0.5 : 1); };
$('mSecs').onclick = () => document.querySelector('aside').scrollIntoView({ behavior: 'smooth' });

document.querySelectorAll('#onbEx .chip').forEach(b => b.onclick = () => { $('url').value = b.dataset.q; $('load').click(); });
$('libSort').value = localStorage.getItem('looper:libsort') || 'recent';
$('libQ').oninput = renderLibrary;
$('libSort').onchange = () => { localStorage.setItem('looper:libsort', $('libSort').value); renderLibrary(); };

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('stage').classList.contains('pfs')) return toggleFullscreen();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable || document.querySelector('dialog[open]')) return;
  if (e.key === '?') { $('keysDlg').showModal(); return e.preventDefault(); }
  if (!player || !player.getCurrentTime) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') toggle();
  else if (k === 'z') zoomSection();
  else if (k === 'v') togglePractice();
  else if (k === 'b') toggleSide();
  else if (e.key === 'ArrowLeft') seekTo(player.getCurrentTime() - 5);
  else if (e.key === 'ArrowRight') seekTo(player.getCurrentTime() + 5);
  else if (k === 'i') setA();
  else if (k === 'o') setB();
  else if (k === 'l') toggleLoop();
  else if (k === 'c') toggleCC();
  else if (k === 'f') toggleFullscreen();
  else if (k === 'm') toggleMute();
  else if (k === 'n') step(1);
  else if (k === 'p') step(-1);
  else if (k === 's') saveSection();
  else if (k === 'd') splitHere();
  else if (/^[1-9]$/.test(e.key) && sections[+e.key - 1]) useSection(sections[+e.key - 1]);
  else if (e.key === '[') setRate(+$('rate').value - 0.05);
  else if (e.key === ']') setRate(+$('rate').value + 0.05);
  else return;
  e.preventDefault();
});

applyLang();
checkServer().then(ok => ok && syncPull());
