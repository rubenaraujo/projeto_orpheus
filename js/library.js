function renderLibrary() {
  const ix = getIndex(), lib = $('lib');
  lib.innerHTML = '';
  const q = ($('libQ').value || '').trim().toLowerCase(), by = $('libSort').value;
  const stats = id => { const l = JSON.parse(localStorage.getItem('looper:' + id) || '[]'); return { n: l.length, p: l.length ? l.filter(x => x.st === 'done').length / l.length : 0 }; };
  let items = Object.entries(ix).filter(([id]) => id === videoId || stats(id).n > 0);
  const total = items.length;
  items = items.filter(([, v]) => !q || (v.title || '').toLowerCase().includes(q));
  items.sort(by === 'name' ? (x, y) => (x[1].title || '').localeCompare(y[1].title || '')
    : by === 'secs' ? (x, y) => stats(y[0]).n - stats(x[0]).n
    : by === 'prog' ? (x, y) => stats(y[0]).p - stats(x[0]).p
    : (x, y) => y[1].t - x[1].t);
  $('libEmpty').style.display = total ? 'none' : '';
  $('libNone').hidden = !(total && !items.length);
  items.forEach(([id, v]) => {
    const { n, p } = stats(id);
    const el = document.createElement('div');
    el.className = 'vid' + (id === videoId ? ' current' : '');
    el.innerHTML = '<div class="th"><img alt=""></div><div class="prog" style="--p:' + (p * 100) + '%"><i></i></div><div class="meta"><span></span><small></small></div><button class="icon rm" title="' + tr('Remover vídeo e secções') + '" aria-label="' + tr('Remover vídeo') + '">' + ico('x') + '</button>';
    el.querySelector('img').src = 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
    el.querySelector('span').textContent = v.title;
    el.querySelector('small').textContent = n + ' ' + (n === 1 ? tr('secção') : tr('secções')) + (p ? ' · ' + tr('{0}% dominado', Math.round(p * 100)) : '');
    el.onclick = () => { if (id !== videoId) { $('url').value = 'https://youtu.be/' + id; loadVideo(id); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    el.querySelector('.rm').onclick = async e => {
      e.stopPropagation();
      if (!(await ask(tr('Remover "{0}" e as suas {1} secções?', v.title, n), 'Remover', true))) return;
      const del = getDel(); del[id] = Date.now(); localStorage.setItem('looper:del', JSON.stringify(del));
      const ix2 = getIndex(); delete ix2[id]; setIndex(ix2);
      localStorage.removeItem('looper:' + id);
      if (id === videoId) { sections = []; activeId = null; renderAll(); } else renderLibrary();
    };
    lib.appendChild(el);
  });
}
