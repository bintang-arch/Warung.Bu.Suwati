/* Service worker Warung Bu Suwati.
   Naikkan versi CACHE (warung-v2, dst.) setiap kali script.js/style.css/HTML diubah,
   karena aset statis memakai strategi cache-first. */
var CACHE = 'warung-v3';
var ASSETS = ['./', './index.html', './admin.html', './style.css', './script.js', './manifest.json',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function simpan(req, res) {
  if (res && res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
  return res;
}
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  // Hanya GET dan satu origin: wa.me, Google Maps, dan Google Fonts tidak pernah disentuh/di-cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { // halaman: network-first, jatuh ke cache saat offline
    e.respondWith(fetch(req).then(function (res) { return simpan(req, res); }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) { // aset statis: cache-first
    return r || fetch(req).then(function (res) { return simpan(req, res); });
  }));
});
