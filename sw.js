/* ============================================
   UHAS Toolkit A - Service Worker
   Complete offline-first PWA with IndexedDB storage
   ============================================ */

const CACHE_VERSION = 'uhas-toolkit-a-v2';
const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app.js',

  // CSS
  './assets/css/main.css',

  // Images
  './assets/img/uhas.jpg',
  './assets/img/hpi.png',

  // Icons
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',

  // Vendor - Bootstrap Icons
  './vendor/bootstrap-icons/bootstrap-icons.min.css',
  './vendor/bootstrap-icons/fonts/bootstrap-icons.woff',
  './vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',

  // Vendor - Fonts
  './vendor/fonts/space-grotesk.css',
  './vendor/fonts/SpaceGrotesk-400.ttf',
  './vendor/fonts/SpaceGrotesk-500.ttf',
  './vendor/fonts/SpaceGrotesk-600.ttf',
  './vendor/fonts/SpaceGrotesk-700.ttf',

  // Vendor - Bootstrap & Tailwind CSS (no external dependencies)
  './vendor/bootstrap/bootstrap.bundle.min.js',
  './vendor/bootstrap/bootstrap.min.css',
  './vendor/tailwind/tailwind.min.css',

  // Scripts - Core IndexedDB & Import/Export
  './assets/js/idb-manager.js',
  './assets/js/import-export.js',
  './assets/js/participant.js',
  './assets/js/sw-updater.js',
  './assets/js/firebase-sync.js'
];

// Install event - cache essential assets
self.addEventListener('install', event => {
  console.log('[SW] Installing UHAS Toolkit A v1...');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] Caching essential assets');
        // Cache assets gracefully - skip missing files
        return Promise.allSettled(
          CACHE_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache: ${url}`, err.message);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete - ready for offline use');
        return self.skipWaiting();
      })
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating UHAS Toolkit A...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_VERSION)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Now controlling all clients');
        return self.clients.claim();
      })
      .then(() => {
        // Notify all clients about the update
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// Listen for skip waiting message from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - offline-first strategy with network fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip external requests (CDN, external APIs, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API calls or internal redirects
  if (url.pathname.includes('/api/') || url.pathname.includes('/__/')) return;

  // Offline-first strategy: cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // If we have it cached, return from cache
        if (cachedResponse) {
          // Update cache in background (stale-while-revalidate)
          event.waitUntil(
            fetch(event.request)
              .then(networkResponse => {
                if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                  caches.open(CACHE_VERSION)
                    .then(cache => cache.put(event.request, networkResponse.clone()));
                }
              })
              .catch(() => { }) // Silently ignore network errors
          );
          return cachedResponse;
        }

        // Not in cache - try network
        return fetch(event.request)
          .then(networkResponse => {
            // Cache successful responses for future offline use
            if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_VERSION)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed and not in cache - return offline fallback for HTML
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html').then(response => {
                return response || caches.match('./');
              });
            }
            // For other assets, return a simple offline response
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync (for when online connectivity returns)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      // Notify clients that they should sync when back online
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_TRIGGERED' });
        });
      })
    );
  }
});

console.log('[SW] UHAS Toolkit A Service Worker loaded - Ready for offline use');
