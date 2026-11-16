const fmt = s => { s = Math.max(0, s); return Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0'); };
const parseId = u => {
  const m = u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || (/^[\w-]{11}$/.test(u.trim()) && [0, u.trim()]);
  return m ? m[1] : null;
};
const key = () => 'looper:' + videoId;
const getIndex = () => JSON.parse(localStorage.getItem('looper:index') || '{}');
const setIndex = ix => { localStorage.setItem('looper:index', JSON.stringify(ix)); scheduleSync(); };
function touchIndex(id, title) {
  const ix = getIndex();
  ix[id] = { title: title || (ix[id] && ix[id].title) || id, t: Date.now() };
  setIndex(ix);
}
function syncTitle() {
  const t = player && player.getVideoData && player.getVideoData().title;
  if (t && videoId && getIndex()[videoId]?.title !== t) { touchIndex(videoId, t); renderLibrary(); }
}
const store = () => { localStorage.setItem(key(), JSON.stringify(sections)); touchIndex(videoId); };
const notesOpen = new Set();

const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
  const last = localStorage.getItem('looper:last');
  const m = location.hash.match(/share=([\w-]+)/);
  if (m) { history.replaceState(null, '', location.pathname); importShare(m[1]); }
  else if (last) { $('url').value = 'https://youtu.be/' + last; loadVideo(last); }
};

function setPressed(btn, on) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); }
