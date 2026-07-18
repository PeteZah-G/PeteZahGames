var cacheName = 'TIWcog';
var filesToCache = ['/js/sw.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(filesToCache)));
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});
