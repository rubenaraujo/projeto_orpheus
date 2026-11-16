/* ---------- sincronização com o servidor ---------- */
const getDel = () => JSON.parse(localStorage.getItem('looper:del') || '{}');
let syncTimer = null, syncOn = true;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 800); }
function snapshot() {
  const index = getIndex(), videos = {};
  Object.keys(index).forEach(id => { videos[id] = JSON.parse(localStorage.getItem('looper:' + id) || '[]'); });
  return { index, videos, del: getDel() };
}
function syncStatus(ok) {
  $('syncMsg').textContent = ok ? tr('Sincronizado com o servidor · {0}', new Date().toLocaleTimeString(lang === 'pt' ? 'pt-PT' : 'en-GB', { hour: '2-digit', minute: '2-digit' })) : tr('Servidor desligado: dados só neste browser.');
}
async function syncPush() {
  try {
    const r = await fetch('/store', { method: 'POST', body: JSON.stringify(snapshot()) });
    syncStatus(r.ok);
  } catch (e) { syncStatus(false); }
}
async function syncPull() {
  let remote;
  try { const r = await fetch('/store'); if (!r.ok) throw 0; remote = await r.json(); } catch (e) { return syncStatus(false); }
  const ix = getIndex(), del = getDel();
  Object.entries(remote.del || {}).forEach(([id, t]) => { del[id] = Math.max(del[id] || 0, t); });
  let changed = false;
  Object.entries(remote.index || {}).forEach(([id, v]) => {
    if (del[id] && del[id] >= v.t) return;
    if (!ix[id] || ix[id].t < v.t) { ix[id] = v; localStorage.setItem('looper:' + id, JSON.stringify((remote.videos || {})[id] || [])); changed = true; }
  });
  Object.entries(del).forEach(([id, t]) => {
    if (ix[id] && ix[id].t < t) { delete ix[id]; localStorage.removeItem('looper:' + id); changed = true; }
  });
  localStorage.setItem('looper:del', JSON.stringify(del));
  localStorage.setItem('looper:index', JSON.stringify(ix));
  if (changed) {
    if (videoId) sections = JSON.parse(localStorage.getItem(key()) || '[]');
    renderAll();
  }
  await syncPush();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncPull(); });
