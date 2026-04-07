'use strict';

const CACHE_NAME = 'aoc-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/game.js',
  '/style.css',
  '/manifest.json',
  '/icons/icon.svg',
];

// ── Install: cache static assets ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-first für Assets, Network-first für API ─────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API-Requests immer ans Netzwerk — niemals cachen
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Statische Assets: Cache-first, Netzwerk als Fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Nur gültige GET-Responses cachen
        if (!response || response.status !== 200 || request.method !== 'GET') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        return response;
      });
    })
  );
});
