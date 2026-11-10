const CACHE_NAME = 'vozfin-v20-offline-definitivo';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './tailwind.min.js',
  './xlsx.full.min.js',
  './firebase-app-compat.js',
  './firebase-firestore-compat.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-512.svg'
];

// 1. Instalação: pré-carrega tudo de forma atômica
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pré-carregando arquivos para offline total...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Ativação: limpa versões antigas e assume o controle imediatamente
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// 3. Interceptação de requisições com suporte offline infalível
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Requisições para APIs do servidor local ou chamadas diretas da nuvem
  if (url.pathname.includes('/api/') || url.hostname.includes('firestore.googleapis.com')) {
    return;
  }

  // Abertura de página (Navegação / HTML): Network-first com fallback garantido para index.html
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResp;
        })
        .catch(async () => {
          // Quando sem internet (offline), procura a URL ignorando query params (ex: ?app=v2)
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          
          // Se não encontrou a URL exata, retorna o index.html principal do cache
          const indexCached = await caches.match('./index.html', { ignoreSearch: true });
          if (indexCached) return indexCached;

          return await caches.match('./', { ignoreSearch: true });
        })
    );
    return;
  }

  // Arquivos estáticos (JS, CSS, Imagens, Ícones): Cache-first com revalidação silenciosa em rede
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResp) => {
      if (cachedResp) {
        // Atualiza o cache silenciosamente em background se houver rede
        fetch(event.request)
          .then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResp));
            }
          })
          .catch(() => {});
        return cachedResp;
      }

      // Se não estava no cache, busca na rede e guarda no cache
      return fetch(event.request).then((networkResp) => {
        if (networkResp && networkResp.status === 200) {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResp;
      });
    })
  );
});
