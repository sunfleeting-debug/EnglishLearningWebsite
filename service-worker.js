/* Versioned app-shell cache for the installable mobile web app. */
const CACHE_VERSION = 'english-learning-v1-20261016-merge';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const SHELL = [
  './', './index.html', './offline.html', './manifest.json',
  './assets/css/style.css', './assets/css/sentences.css',
  './assets/js/util.js', './assets/js/config.js', './assets/js/store.js',
  './assets/js/sentences.js', './assets/js/api.js', './assets/js/sync.js',
  './assets/js/speech.js', './assets/js/data.js', './assets/js/components.js',
  './assets/js/motion.js', './assets/js/app.js',
  './assets/js/views/home.js', './assets/js/views/books.js', './assets/js/views/word.js',
  './assets/js/views/practice.js', './assets/js/views/sentences.js', './assets/js/views/review.js',
  './assets/js/views/srs.js', './assets/js/views/audio.js', './assets/js/views/stats.js',
  './assets/js/views/resources.js', './assets/js/views/reading.js', './assets/js/views/settings.js',
  './assets/js/views/account.js', './assets/js/views/admin.js',
  './data/books.js', './data/words.js', './data/reading.js', './data/sentences.js', './data/dicts/index.js',
  './assets/img/icon-180.png', './assets/img/icon-192.png', './assets/img/icon-512.png',
  './assets/img/icon-maskable-512.png', './assets/img/intro-typewriter.webp', './assets/img/shadow-leaves.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('english-learning-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.includes('/api/') || url.hostname === 'dict.youdao.com' || url.hostname === 'api.datamuse.com';
}

function isLargeMedia(url) {
  return /\.(?:mp3|pdf)$/i.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApi(url) || isLargeMedia(url)) return;
  // Browser audio seeking uses Range. Let the origin server handle those responses.
  if (request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then(cache => cache.put('./index.html', copy));
      }
      return response;
    }).catch(() => caches.match('./index.html').then(response => response || caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (!response.ok || response.status === 206) return response;
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match('./offline.html'));
  }));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
