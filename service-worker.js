// Banheza Pool — service worker: cacheia o "app shell" (HTML/CSS/JS estáticos) para abrir
// offline. Dados (Supabase) e dependências externas (fontes, ícones, jsPDF, supabase-js)
// seguem sempre direto pela rede — não fazem sentido em cache, e o app já avisa quando não
// consegue falar com o servidor.
const CACHE_NAME = 'banheza-pool-v5';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/supabase-config.js',
  './js/volume.js',
  './js/products-data.js',
  './js/diagnostics.js',
  './js/chart.js',
  './js/i18n.js',
  './js/db.js',
  './js/pdf.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/brand/symbol-b.png',
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

// Rede primeiro, cache só como fallback pra quando estiver offline de verdade — não o
// contrário. Com o app em desenvolvimento ativo (novas versões saindo com frequência), servir
// o cache primeiro e só atualizar em segundo plano significa que qualquer PR que mude
// app.js/css/diagnostics.js sem também trocar CACHE_NAME fica "no ar" pro servidor mas
// invisível pra quem já tinha o PWA instalado — foi exatamente o que aconteceu aqui. Com
// rede primeiro, a pessoa sempre vê a versão publicada mais recente enquanto tiver conexão;
// o cache entra só se a rede falhar.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});
