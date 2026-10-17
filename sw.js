/* ==========================================================================
   sw.js — Lab Desk offline shell
   - cache-first for the immutable shell (css / js / vendor / icons)
   - network-first for the JSON database file, so a deployed site always
     seeds the newest published data
   - never touches the GitHub sync requests (they go to api.github.com)
   ========================================================================== */
var CACHE = 'snpl-lab-desk-v1';
var SHELL = [
  './', './index.html', './manifest.webmanifest', './assets/icon.svg',
  './css/theme.css', './css/shell.css', './css/print.css',
  './data/lab-data.json', './vendor/xlsx/xlsx-js-style.min.js',
  './js/util.js', './js/schema.js', './js/db.js', './js/live.js', './js/ui.js',
  './js/virt.js', './js/excel.js', './js/auth.js', './js/app.js',
  './js/pages/collection.js', './js/pages/dashboard.js', './js/pages/data.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  var url = new URL(req.url);
  if (/\.(json)(\?|$)/.test(url.pathname)) {          // data file: always try the network first
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {   // shell: cache first = instant paint
    if (hit) {
      caches.open(CACHE).then(function (c) { c.put(req, fetch(req).catch(function () { })); });
      return hit;
    }
    return fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return req.mode === 'navigate' ? caches.match('./index.html') : Response.error(); });
  }));
});

self.addEventListener('message', function (e) { if (e.data === 'skip') self.skipWaiting(); });
