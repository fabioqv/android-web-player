const VERSAO = 'player-v1';
const CACHE_APP = 'app-' + VERSAO;
const CACHE_FONTES = 'fontes-' + VERSAO;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_APP).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSAO)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes do Google: guarda para usar offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE_FONTES).then(async (cache) => {
        const guardado = await cache.match(req);
        const rede = fetch(req).then((r) => { cache.put(req, r.clone()); return r; }).catch(() => guardado);
        return guardado || rede;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Página principal: tenta a internet (para pegar versão nova) e cai no guardado se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const copia = r.clone(); caches.open(CACHE_APP).then((c) => c.put('/', copia)); return r; })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Demais arquivos do app (código, imagens): usa o guardado e atualiza em segundo plano
  e.respondWith(
    caches.open(CACHE_APP).then(async (cache) => {
      const guardado = await cache.match(req);
      const rede = fetch(req)
        .then((r) => { if (r.ok) cache.put(req, r.clone()); return r; })
        .catch(() => guardado);
      return guardado || rede;
    })
  );
});
