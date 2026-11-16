function layoutTl() {
  const partial = A() > 0.05 || (duration && B() < duration - 0.5);
  [['loopSel', 'timeline'], ['fsLoopSel', 'fsTimeline']].forEach(([id, tl]) => {
    const el = $(id), v = tlView(tl);
    el.style.display = partial ? '' : 'none';
    el.style.left = ((A() - v.s) / v.w * 100) + '%';
    el.style.width = (Math.max(0, B() - A()) / v.w * 100) + '%';
  });
  document.querySelectorAll('.seg').forEach(e => {
    const s = sections[+e.dataset.i]; if (!s) return;
    const v = tlView(e.parentElement.id);
    e.style.left = ((s.a - v.s) / v.w * 100) + '%'; e.style.width = ((s.b - s.a) / v.w * 100) + '%';
  });
  document.querySelectorAll('.hdl').forEach(e => {
    const s = sections[+e.dataset.i]; if (!s) return;
    const v = tlView(e.parentElement.id);
    e.style.left = (((e.dataset.e === 'a' ? s.a : s.b) - v.s) / v.w * 100) + '%';
  });
  placeHead(curT);
  $('zmap').hidden = zoom.z <= 1;
  $('zwin').style.left = (zoom.s / (duration || 1) * 100) + '%'; $('zwin').style.width = (100 / zoom.z) + '%';
  $('zLbl').textContent = (Math.round(zoom.z * 10) / 10) + '×';
}
function placeHead(t) {
  const v = tlView('timeline');
  if (duration) { $('head').style.left = ((t - v.s) / v.w * 100) + '%'; $('fsHead').style.left = (t / duration * 100) + '%'; }
}
function setZoom(z, anchor) {
  if (!duration) return;
  const v = tlView('timeline');
  anchor ??= v.s + v.w / 2;
  const frac = (anchor - v.s) / v.w;
  zoom.z = z < 1.05 ? 1 : Math.min(40, z);
  zoom.s = zoom.z === 1 ? 0 : clampS(anchor - frac * duration / zoom.z);
  layoutTl();
}
function zoomTo(a, b) {
  if (!duration || b - a < 0.3) return;
  const pad = (b - a) * 0.15;
  zoom.z = Math.min(40, Math.max(1, duration / (b - a + 2 * pad)));
  zoom.s = clampS(a - pad);
  layoutTl();
}
function zoomSection() {
  if (zoom.z > 1) return setZoom(1);
  const s = sections.find(x => x.id === activeId);
  if (s) zoomTo(s.a, s.b); else if (B() > A()) zoomTo(A(), B());
}
async function loadStory(id) {
  try { const j = await api('/info?v=' + id); if (id === videoId) story = j.story || null; } catch (e) {}
}
function showTip(e) {
  if (!duration) return;
  const tl = $('timeline'), r = tl.getBoundingClientRect(), v = tlView('timeline');
  const px = Math.max(0, Math.min(r.width, e.clientX - r.left));
  const t = Math.max(0, Math.min(duration, v.s + px / r.width * v.w));
  const hov = $('hov'); hov.style.display = 'block'; hov.style.left = px + 'px';
  const tip = $('tlTip'), pv = $('tipPv');
  if (story) {
    const per = story.rows * story.cols, k = Math.min(Math.floor(t * story.fps), story.urls.length * per - 1);
    const sheet = Math.floor(k / per), w = k % per;
    pv.style.display = 'block';
    pv.style.backgroundImage = 'url(' + JSON.stringify(story.urls[sheet]) + ')';
    pv.style.backgroundSize = (story.cols * story.w) + 'px ' + (story.rows * story.h) + 'px';
    pv.style.backgroundPosition = '-' + ((w % story.cols) * story.w) + 'px -' + (Math.floor(w / story.cols) * story.h) + 'px';
    pv.style.width = story.w + 'px'; pv.style.height = story.h + 'px';
  } else pv.style.display = 'none';
  const s = sections.find(x => t >= x.a && t < x.b);
  $('tipT').textContent = fmt(t);
  $('tipS').textContent = s ? s.name : '';
  tip.style.display = 'block';
  tip.style.left = Math.max(100, Math.min(innerWidth - 100, e.clientX)) + 'px';
  tip.style.top = (r.top - 8) + 'px';
}
function hideTip() { $('tlTip').style.display = 'none'; $('hov').style.display = 'none'; }

function buildTimelines() {
  document.querySelectorAll('.seg, .hdl').forEach(e => e.remove());
  ['timeline', 'fsTimeline'].forEach(id => {
    const tl = $(id);
    sections.forEach((s, i) => {
      const e = document.createElement('div');
      e.className = 'seg' + (s.id === activeId ? ' active' : '') + (s.off ? ' off' : '') + (s.st ? ' st-' + s.st : '') + (s.col ? ' col' : '');
      if (s.col) e.style.setProperty('--c', s.col);
      e.title = s.name; e.textContent = i + 1; e.dataset.i = i;
      tl.prepend(e);
      const next = tNext(s);
      if (s.a >= 0.2) tl.appendChild(handle(i, 'a'));
      if (!next || next.a - s.b >= 0.3) tl.appendChild(handle(i, 'b'));
    });
  });
  layoutTl();
}

function handle(i, edge) {
  const h = document.createElement('div');
  h.className = 'hdl'; h.dataset.i = i; h.dataset.e = edge;
  h.title = tr('Arrastar para ajustar');
  h.onclick = e => e.stopPropagation();
  h.onpointerdown = ev => startDrag(ev, h, i, edge);
  return h;
}

function startDrag(ev, h, i, edge) {
  if (!duration) return;
  ev.preventDefault(); ev.stopPropagation();
  const s = sections[i], prev = tPrev(s), tl = h.parentElement;
  const link = edge === 'a' && prev && Math.abs(prev.b - s.a) < 0.3 ? prev : null;
  h.setPointerCapture(ev.pointerId); h.classList.add('drag');
  h.onpointermove = e => {
    const r = tl.getBoundingClientRect(), v = tlView(tl.id);
    let t = snap(v.s + (e.clientX - r.left) / r.width * v.w);
    if (edge === 'a') {
      t = Math.min(Math.max(t, link ? link.a + 0.3 : 0), s.b - 0.3);
      setBounds(s, t, s.b); if (link) setBounds(link, link.a, s.a);
    } else {
      t = Math.max(t, s.a + 0.3); setBounds(s, s.a, t);
    }
    layoutTl();
  };
  h.onpointerup = h.onpointercancel = () => {
    h.onpointermove = h.onpointerup = h.onpointercancel = null;
    store(); renderAll();
  };
}

const snap = t => Math.round(t * 10) / 10;
function setBounds(s, a, b) {
  a = snap(Math.max(0, a)); b = snap(duration ? Math.min(duration, b) : b);
  if (b - a < 0.3) return false;
  s.a = a; s.b = b;
  if (s.id === activeId) { $('a').value = a; $('b').value = b; if (stopAt !== null) stopAt = b; }
  return true;
}

function splitHere() {
  if (!player || !player.getCurrentTime) return;
  const t = snap(player.getCurrentTime());
  const s = sections.find(x => t > x.a + 0.3 && t < x.b - 0.3);
  if (!s) return toast('Põe o vídeo dentro de uma secção para a dividir.', 'err');
  const n = { id: Date.now(), name: s.name + ' (2)', a: t, b: s.b };
  setBounds(s, s.a, t);
  sections.splice(sections.indexOf(s) + 1, 0, n);
  store(); renderAll(); toast(tr('Secção dividida aos {0}.', fmt(t)));
}

const PALETTE = ['#e5645f', '#e9892b', '#d9c84a', '#5fd38d', '#4fc3c7', '#5b9cf0', '#d97ad0'];

function startReorder(ev, li, from) {
  ev.preventDefault(); ev.stopPropagation();
  const grip = ev.currentTarget, items = [...$('list').children];
  let to = from;
  grip.setPointerCapture(ev.pointerId); li.classList.add('dragging');
  const mark = () => items.forEach((x, k) => {
    x.classList.toggle('dropTop', k === to && to < from);
    x.classList.toggle('dropBot', k === to && to > from);
  });
  grip.onpointermove = e => {
    const k = items.findIndex(x => e.clientY < x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2);
    to = k < 0 ? items.length - 1 : k;
    mark();
  };
  grip.onpointerup = grip.onpointercancel = () => {
    grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
    if (to !== from) {
      const [m] = sections.splice(from, 1); sections.splice(to, 0, m);
      queue = null; store();
    }
    renderAll();
  };
}
