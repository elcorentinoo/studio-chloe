/**
 * Studio Chloé — service worker (application installable, utilisable hors ligne)
 *
 *  - Installation : met en cache la page, les styles, les scripts (liste lue
 *    directement dans index.html), le logo et les icônes.
 *  - Fichiers de l'app et bibliothèques des CDN : « stale-while-revalidate »
 *    (réponse immédiate depuis le cache, mise à jour en arrière-plan).
 *  - /api/… (détourage Remove.bg) et toute requête non GET : toujours le réseau.
 *  Changer CACHE_VERSION force le renouvellement complet du cache.
 */
const CACHE_VERSION = 'studio-chloe-0.5.0';
const CORE = ['./', './index.html', './style.css', './app.js', './logo.svg', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './apple-touch-icon.png'];
const RUNTIME_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    let scripts = [];
    try {
      const html = await (await fetch('./index.html', { cache: 'no-cache' })).text();
      scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => `./${m[1]}`);
    } catch { /* hors ligne pendant l'installation : le cache se remplira à l'usage */ }
    await Promise.all([...CORE, ...scripts].map((url) => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.startsWith('/api/')) return; // fonctions Netlify : réseau seulement
  if (!sameOrigin && !RUNTIME_HOSTS.includes(url.hostname)) return; // autres services (IA…) : réseau
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req, { ignoreSearch: sameOrigin && req.mode === 'navigate' });
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
