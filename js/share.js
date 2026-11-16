async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; }
}

async function shareLink() {
  if (!videoId || !sections.length) return toast('Não há secções para partilhar.', 'err');
  const code = b64e({ v: videoId, t: (getIndex()[videoId] || {}).title || '', s: sections.map(x => [x.name, x.a, x.b, x.note || '', x.off ? 1 : 0, x.st === 'done' ? 2 : x.st === 'work' ? 1 : 0, x.col || '']) });
  const ok = await copyText(location.origin + location.pathname + '#share=' + code);
  toast(ok ? 'Link copiado. Cola-o na barra de pesquisa do Orpheus para importar.' : 'Não consegui copiar para a área de transferência.', ok ? '' : 'err');
}

async function importShare(code) {
  let p;
  try { p = b64d(code); } catch (e) { return toast('Link de partilha inválido.', 'err'); }
  const list = p && /^[\w-]{11}$/.test(p.v) ? cleanSections((p.s || []).map(x => ({ name: x[0], a: x[1], b: x[2], note: x[3], off: x[4], st: ['', 'work', 'done'][x[5]] || '', col: x[6] }))) : [];
  if (!list.length) return toast('Link de partilha inválido.', 'err');
  const have = JSON.parse(localStorage.getItem('looper:' + p.v) || '[]');
  if (have.length && !(await ask(tr('Já tens {0} secções neste vídeo. Substituir pelas {1} recebidas?', have.length, list.length), 'Substituir'))) return;
  localStorage.setItem('looper:' + p.v, JSON.stringify(list));
  const ix = getIndex(); ix[p.v] = { title: String(p.t || p.v).slice(0, 200), t: Date.now() }; setIndex(ix);
  $('url').value = 'https://youtu.be/' + p.v; loadVideo(p.v);
  toast(tr('{0} secções importadas.', list.length));
}

function exportAll() {
  const ix = getIndex(), videos = {};
  Object.keys(ix).forEach(id => {
    const sec = JSON.parse(localStorage.getItem('looper:' + id) || '[]');
    if (sec.length) videos[id] = { title: ix[id].title, sections: sec };
  });
  if (!Object.keys(videos).length) return toast('Não há nada para exportar.', 'err');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'looper', version: 1, videos }, null, 1)], { type: 'application/json' }));
  a.download = 'orpheus-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(tr('{0} vídeos exportados.', Object.keys(videos).length));
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { return toast('Ficheiro inválido.', 'err'); }
  const entries = Object.entries(data && data.videos || {}).filter(([id]) => /^[\w-]{11}$/.test(id))
    .map(([id, v]) => [id, String(v.title || id).slice(0, 200), cleanSections(v.sections)]).filter(e => e[2].length);
  if (!entries.length) return toast('O ficheiro não tem secções válidas.', 'err');
  if (!(await ask(tr('Importar {0} vídeos? Os que já existem serão substituídos.', entries.length), 'Importar'))) return;
  const ix = getIndex();
  entries.forEach(([id, title, list]) => { localStorage.setItem('looper:' + id, JSON.stringify(list)); ix[id] = { title, t: Date.now() }; });
  setIndex(ix);
  if (videoId) sections = JSON.parse(localStorage.getItem(key()) || '[]');
  renderAll(); toast(tr('{0} vídeos importados.', entries.length));
}

$('shareLink').onclick = shareLink;
$('expAll').onclick = exportAll;
$('impAll').onclick = () => $('impFile').click();
$('impFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; f && importFile(f); };
$('srvRetry').onclick = async () => { const ok = await checkServer(); toast(ok ? 'Servidor ligado.' : 'Continua desligado.', ok ? '' : 'err'); };
$('srvCopy').onclick = async () => { const ok = await copyText('.venv/bin/python server.py'); toast(ok ? 'Comando copiado.' : 'Não consegui copiar.', ok ? '' : 'err'); };
