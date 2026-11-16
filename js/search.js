const getRecent = () => JSON.parse(localStorage.getItem('looper:recent') || '[]');
const setRecent = r => localStorage.setItem('looper:recent', JSON.stringify(r));
const pushRecent = q => setRecent([q, ...getRecent().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8));
function renderRecent() {
  const box = $('recent'), q = $('url').value.trim().toLowerCase();
  const items = getRecent().filter(x => !q || (x.toLowerCase().includes(q) && x.toLowerCase() !== q));
  if (!items.length || /^https?:|share=/.test(q)) return box.classList.remove('open');
  box.innerHTML = '<div class="rh"><span>' + tr('Pesquisas recentes') + '</span><button id="recClear">' + tr('Limpar') + '</button></div>';
  items.forEach(t => {
    const row = document.createElement('div'); row.className = 'ri';
    row.innerHTML = '<button class="q"></button><button class="icon" aria-label="' + tr('Remover pesquisa') + '">' + ico('x') + '</button>';
    row.querySelector('.q').textContent = t;
    row.querySelector('.q').onclick = () => { $('url').value = t; box.classList.remove('open'); $('load').click(); };
    row.querySelector('.icon').onclick = () => { setRecent(getRecent().filter(x => x !== t)); renderRecent(); };
    box.appendChild(row);
  });
  $('recClear').onclick = () => { setRecent([]); box.classList.remove('open'); };
  box.classList.add('open');
}
$('recent').onmousedown = e => e.preventDefault();
$('url').onfocus = $('url').oninput = renderRecent;
$('url').onblur = () => $('recent').classList.remove('open');

$('load').onclick = () => {
  const v = $('url').value.trim();
  $('recent').classList.remove('open');
  if (!v) return;
  const sh = v.match(/share=([\w-]+)/);
  if (sh) { $('url').value = ''; return importShare(sh[1]); }
  const id = parseId(v);
  id ? (closeResults(), loadVideo(id)) : runSearch(v);
};

let found = [];
const filters = new Set();
const closeResults = () => $('results').classList.remove('open');
const views = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : n;

async function runSearch(q) {
  const box = $('results'), msg = $('resMsg');
  box.classList.add('open'); $('resList').innerHTML = '';
  msg.className = 'res-msg busy'; msg.textContent = tr('A pesquisar e a avaliar os vídeos… cerca de 10 segundos.');
  try {
    found = (await api('/search?q=' + encodeURIComponent(q))).results;
    pushRecent(q);
    renderResults();
  } catch (e) {
    msg.className = 'res-msg'; msg.textContent = e.message === 'offline' ? tr(OFFLINE) : tr('Falhou: {0}', e.message);
  }
}

function renderResults() {
  const list = found.filter(r =>
    (!filters.has('structure') || r.structure) && (!filters.has('hd') || r.height >= 1080) && (!filters.has('chords') || r.chords));
  const msg = $('resMsg');
  msg.className = 'res-msg';
  msg.textContent = list.length ? tr('{0} de {1} vídeos, ordenados por qualidade.', list.length, found.length) : tr('Nenhum vídeo cumpre estes filtros. Tira um filtro ou muda a pesquisa.');
  $('resList').innerHTML = '';
  list.forEach(r => {
    const el = document.createElement('div');
    el.className = 'res';
    const tags = [
      r.structure ? [tr('Secções do autor ({0})', tr(r.structure)), 1] : [tr('Sem secções'), 0],
      r.height ? [r.height >= 2160 ? '4K' : r.height + 'p', r.height >= 1080] : null,
      r.chords ? ['Acordes', 1] : null
    ].filter(Boolean);
    el.innerHTML = '<div class="th"><img alt="" loading="lazy"><span class="dur"></span></div><div><div class="t"></div><div class="m"></div><div class="tags"></div><div class="why"></div></div><button class="score" aria-expanded="false" title="' + tr('Ver porque tem esta pontuação') + '"></button>';
    el.querySelector('img').src = 'https://i.ytimg.com/vi/' + r.id + '/mqdefault.jpg';
    el.querySelector('.dur').textContent = fmt(r.duration);
    el.querySelector('.t').textContent = r.title;
    el.querySelector('.m').textContent = [r.channel, r.views ? tr('{0} visualizações', views(r.views)) : ''].filter(Boolean).join(' · ');
    el.querySelector('.tags').innerHTML = tags.map(([t, ok]) => '<span class="tag' + (ok ? ' ok' : '') + '">' + t + '</span>').join('');
    const sc = el.querySelector('.score'); sc.style.setProperty('--p', r.score); sc.dataset.v = r.score;
    el.querySelector('.why').innerHTML = (r.why || []).map(([l, p]) => '<div><span>' + (/^Resolução (\d+)p$/.test(l) ? tr('Resolução {0}p', l.match(/\d+/)[0]) : tr(l)) + '</span><b>+' + p + '</b></div>').join('') + '<div class="tot"><span>' + tr('Total') + '</span><b>' + r.score + '/100</b></div>';
    sc.onclick = e => { e.stopPropagation(); const on = el.classList.toggle('showwhy'); sc.setAttribute('aria-expanded', on); };
    el.onclick = () => { $('url').value = 'https://youtu.be/' + r.id; closeResults(); loadVideo(r.id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    $('resList').appendChild(el);
  });
}

document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
  const f = c.dataset.f;
  filters.has(f) ? filters.delete(f) : filters.add(f);
  c.classList.toggle('on', filters.has(f));
  renderResults();
});
$('resClose').onclick = closeResults;
$('url').onkeydown = e => { if (e.key === 'Enter') $('load').click(); };
