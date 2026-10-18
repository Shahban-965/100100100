/* LabDesk — service worker: offline-first app shell */
'use strict';
const CACHE = 'labdesk-v1';
const CORE = [
  './',
  'index.html',
  'css/theme.css',
  'css/app.css',
  'css/print.css',
  'js/util.js',
  'js/seed.js',
  'js/db.js',
  'js/auth.js',
  'js/grid.js',
  'js/scroll.js',
  'js/pages.js',
  'js/app.js',
  'assets/icon.svg',
  'assets/img/bg-abstract.jpg',
  'assets/img/login-boy.jpg',
  'assets/img/baby-1.jpg',
  'assets/img/baby-2.jpg',
  'assets/img/baby-3.jpg',
  'assets/img/baby-4.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  /* fresh data file → network first */
  if (url.pathname.endsWith('db.json')) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  /* everything else → cache first, network fallback */
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match('index.html')))
  );
});
