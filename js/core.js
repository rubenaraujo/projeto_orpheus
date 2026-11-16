const $ = id => document.getElementById(id);
function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind === 'err' ? ' err' : ''); t.textContent = tr(msg);
  $('toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3500);
  setTimeout(() => t.remove(), 3800);
}
function ask(msg, ok = 'Confirmar', danger = false) {
  return new Promise(res => {
    const d = $('dlg'), y = $('dlgYes');
    $('dlgMsg').textContent = tr(msg); y.textContent = tr(ok); y.classList.toggle('danger', danger);
    d.returnValue = ''; d.onclose = () => res(d.returnValue === 'ok');
    d.showModal();
  });
}
async function api(path) {
  let r, j;
  try { r = await fetch(path); j = await r.json(); } catch (e) { checkServer(); throw new Error('offline'); }
  if (!r.ok) throw new Error(tr(j.error || 'erro'));
  return j;
}
async function checkServer() {
  let ok = false;
  try { ok = (await (await fetch('/health')).json()).ok === true; } catch (e) {}
  $('srv').classList.toggle('show', !ok);
  return ok;
}
const OFFLINE = 'Servidor desligado. Vê as instruções no topo da página.';
const ico = n => '<svg class="i"><use href="#i-' + n + '"/></svg>';
let queue = null, holdUntil = 0, ccOn = false, player, videoId = null, duration = 0, loopOn = false, countOn = false, stopAt = null, counting = false, activeId = null;
let sections = [], lastSig = null;
