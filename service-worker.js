// Banheza Pool — service worker: cacheia o "app shell" (HTML/CSS/JS estáticos) para abrir
// offline. Dados (Supabase) e dependências externas (fontes, ícones, jsPDF, supabase-js)
// seguem sempre direto pela rede — não fazem sentido em cache, e o app já avisa quando não
// consegue falar com o servidor.
const CACHE_NAME = 'banheza-pool-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/supabase-config.js',
  './js/volume.js',
  './js/products-data.js',
  './js/diagnostics.js',
  './js/db.js',
  './js/pdf.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const rede = fetch(event.request)
        .then((resposta) => {
          if (resposta && resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return resposta;
        })
        .catch(() => cached);
      return cached || rede;
    })
  );
});
