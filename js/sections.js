const ST_LBL = { '': 'Estado: por começar', work: 'Estado: a trabalhar', done: 'Estado: dominada' };
function renderMastery() {
  const n = sections.length, d = sections.filter(x => x.st === 'done').length, w = sections.filter(x => x.st === 'work').length;
  const el = $('mastery');
  el.innerHTML = !(d + w) ? '' : '<span>' + [d ? tr('{0} dominadas', d) : '', w ? tr('{0} a trabalhar', w) : ''].filter(Boolean).join(' · ') + '</span><i style="--p:' + (n ? d / n * 100 : 0) + '%"></i>';
}
function renderAll() {
  renderMastery();
  const cs = sections.find(x => x.id === activeId), cur = $('curSec');
  cur.textContent = '';
  if (cs) { cur.append(tr('Secção ativa:') + ' '); const b = document.createElement('b'); b.textContent = cs.name; cur.append(b, ' · ' + fmt(cs.a) + '–' + fmt(cs.b)); }
  buildTimelines();
  renderLibrary();
  $('cnt').textContent = sections.filter(x => !x.off).length + '/' + sections.length;
  $('selAll').textContent = sections.every(x => !x.off) ? tr('Nenhuma') : tr('Todas');
  renderFs();
  $('empty').style.display = sections.length ? 'none' : '';
  const scBox = $('list').parentElement, scTop = scBox.scrollTop;
  $('list').innerHTML = '';
  sections.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = (s.id === activeId ? 'active' : '') + (s.off ? ' off' : '') + (s.col ? ' col' : '');
    if (s.col) li.style.setProperty('--c', s.col);
    const playing = s.id === activeId && stopAt !== null && player && player.getPlayerState && player.getPlayerState() === 1;
    li.innerHTML =
      '<button class="grip" title="' + tr('Arrastar para reordenar') + '" aria-label="' + tr('Arrastar para reordenar') + '">' + ico('grip') + '</button>' +
      '<button class="chk" aria-pressed="' + !s.off + '" title="' + tr('Incluir na reprodução') + '" aria-label="' + tr('Incluir na reprodução') + '">' + ico('check') + '</button>' +
      '<button class="go" title="' + tr(playing ? 'Pausar' : 'Tocar só esta secção') + '" aria-label="' + tr(playing ? 'Pausar' : 'Tocar') + '">' + ico(playing ? 'pause' : 'play') + '</button>' +
      '<div class="name"><input aria-label="' + tr('Nome da secção') + '"><small>' + (i + 1) + ' · ' + fmt(s.a) + ' – ' + fmt(s.b) + '</small></div>' +
      '<div class="acts">' +
        '<button class="stbtn ' + (s.st || '') + '" title="' + tr(ST_LBL[s.st || '']) + '" aria-label="' + tr(ST_LBL[s.st || '']) + '"><i></i></button>' +
        '<button class="icon noteBtn' + (s.note ? ' has' : '') + '" title="' + tr('Detalhes: tempos e notas') + '" aria-label="' + tr('Detalhes da secção') + '">' + ico('note') + '</button>' +
        (tNext(s) ? '<button class="icon merge" title="' + tr('Juntar com a seguinte') + '" aria-label="' + tr('Juntar com a seguinte') + '">' + ico('merge') + '</button>' : '') +
        '<button class="icon danger del" title="' + tr('Apagar') + '" aria-label="' + tr('Apagar') + '">' + ico('x') + '</button>' +
      '</div>';
    if (notesOpen.has(s.id)) {
      const ed = document.createElement('div');
      ed.className = 'edit'; ed.onclick = e => e.stopPropagation();
      ed.innerHTML = ['a', 'b'].map(k => '<div class="nudge" data-k="' + k + '"><span>' + tr(k === 'a' ? 'Início' : 'Fim') + '</span><button class="ghost mono" data-d="-0.1">−0.1</button><input type="number" step="0.1" min="0" aria-label="' + tr(k === 'a' ? 'Início em segundos' : 'Fim em segundos') + '" value="' + s[k].toFixed(1) + '"><button class="ghost mono" data-d="0.1">+0.1</button><button class="ghost mono" data-now title="' + tr('Usar o tempo atual do vídeo') + '">' + tr('Agora') + '</button></div>').join('');
      const apply = (k, v) => {
        if (isNaN(v)) return;
        if (!(k === 'a' ? setBounds(s, v, s.b) : setBounds(s, s.a, v))) return toast('A secção tem de ter pelo menos 0,3 s.', 'err');
        store(); renderAll();
      };
      ed.querySelectorAll('.nudge').forEach(n => {
        const k = n.dataset.k, inp = n.querySelector('input');
        n.querySelectorAll('[data-d]').forEach(b => b.onclick = () => apply(k, s[k] + +b.dataset.d));
        n.querySelector('[data-now]').onclick = () => player && apply(k, player.getCurrentTime());
        inp.onchange = () => apply(k, parseFloat(inp.value));
      });
      const ta = document.createElement('textarea');
      ta.className = 'note'; ta.placeholder = tr('Dedilhado, truques, o que falta acertar…'); ta.value = s.note || '';
      ta.oninput = () => { s.note = ta.value; store(); li.querySelector('.noteBtn').classList.toggle('has', !!s.note); };
      ed.appendChild(ta);
      const sw = document.createElement('div');
      sw.className = 'swatches';
      sw.innerHTML = '<span>' + tr('Cor') + '</span>';
      ['', ...PALETTE].forEach(c => {
        const b = document.createElement('button');
        b.className = 'sw' + (c ? '' : ' none'); b.setAttribute('aria-pressed', (s.col || '') === c);
        b.title = b.ariaLabel = c ? tr('Cor da secção') : tr('Sem cor');
        if (c) b.style.setProperty('--c', c);
        b.onclick = () => { if (c) s.col = c; else delete s.col; store(); renderAll(); };
        sw.appendChild(b);
      });
      ed.appendChild(sw);
      li.appendChild(ed);
    }
    const inp = li.querySelector('input'); inp.value = s.name;
    inp.onchange = () => { s.name = inp.value; store(); };
    inp.onclick = e => e.stopPropagation();
    li.querySelector('.chk').onclick = e => { e.stopPropagation(); s.off = !s.off; store(); renderAll(); };
    const mg = li.querySelector('.merge');
    if (mg) mg.onclick = e => {
      e.stopPropagation();
      const next = tNext(s);
      queue = null; s.b = next.b; sections = sections.filter(x => x !== next);
      if (activeId === next.id) activeId = s.id;
      store(); renderAll();
    };
    li.querySelector('.grip').onpointerdown = ev => startReorder(ev, li, i);
    li.querySelector('.grip').onclick = e => e.stopPropagation();
    li.querySelector('.stbtn').onclick = e => {
      e.stopPropagation();
      s.st = s.st === 'work' ? 'done' : s.st === 'done' ? '' : 'work';
      if (!s.st) delete s.st;
      store(); renderAll();
    };
    li.querySelector('.noteBtn').onclick = e => {
      e.stopPropagation();
      notesOpen.has(s.id) ? notesOpen.delete(s.id) : notesOpen.add(s.id);
      renderAll();
      
    };
    li.querySelector('.del').onclick = e => { e.stopPropagation(); queue = null; sections = sections.filter(x => x !== s); store(); renderAll(); };
    li.querySelector('.go').onclick = e => { e.stopPropagation(); if (playing) { stopAt = null; player.pauseVideo(); } else useSection(s); };
    li.onclick = () => useSection(s);
    $('list').appendChild(li);
  });
  scBox.scrollTop = scTop;
}
