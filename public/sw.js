const CACHE = 'aulas-v2';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

// Remove do cache assets com hash que o index.html atual não referencia mais;
// sem isso o cache cresce a cada deploy até pressionar a cota do iOS.
async function pruneStaleAssets() {
  try {
    const res = await fetch('./index.html', { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const live = new Set((html.match(/assets\/[A-Za-z0-9._-]+/g) || []));
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) {
      const m = new URL(req.url).pathname.match(/assets\/[A-Za-z0-9._-]+$/);
      if (m && !live.has(m[0])) await cache.delete(req);
    }
  } catch {}
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => pruneStaleAssets())
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  // Manifest e ícones também network-first: com cache-first e nome de cache
  // fixo, uma versão nova nunca chegaria a instalações existentes.
  const isShellAsset = /manifest\.webmanifest$|\/icons\//.test(url.pathname);

  if (isHTML || isShellAsset) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || (isHTML ? caches.match('./index.html') : Response.error()))),
    );
    return;
  }

  // Cache-first para assets com hash do Vite
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && (res.type === 'basic' || res.type === 'default')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
