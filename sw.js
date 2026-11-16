const CACHE = 'orpheus-v4';
const SHELL = ['./', 'index.html', 'styles.css', 'js/core.js', 'js/i18n.js', 'js/state.js', 'js/sync.js', 'js/player.js', 'js/timeline.js', 'js/sections.js', 'js/library.js', 'js/playback.js', 'js/share.js', 'js/search.js', 'js/main.js', 'logo.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
const API = ['/analyze', '/search', '/info', '/store', '/health'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (API.some(p => url.pathname.startsWith(p))) return;
    // network first so edits show up, cache as the offline fallback
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
});
