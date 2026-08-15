const CACHE_NAME = 'hayat-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/logo.png',
  '/logoo.png',
  '/manifest.json',
  '/البطاقة المطبوعة .pdf',
  '/%D8%A7%D9%84%D8%A8%D8%B7%D8%A7%D9%82%D8%A9%20%D8%A7%D9%84%D9%85%D8%B7%D8%A8%D9%88%D8%B9%20.pdf'
];

// Install Service Worker and cache essential shells
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching critical application shell');
      // Use silence mode on individual addAll failures to prevent service worker install blocking
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => {
          return cache.add(asset).catch(err => {
            console.warn(`[Service Worker] Failed to pre-cache ${asset}:`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Evicting stale cache branch:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Dynamic Offline interceptor
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Guard clause to handle URLs gracefully
  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  // Only intercept standard http / https schemes to avoid breaking local data:, blob:, or chrome-extension: resources
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Only handle requests to our own origin (local assets) to prevent blocking/interfering with external APIs, RPC services, and developer tools
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip intercepting POST or other transactional mutations for safety
  if (request.method !== 'GET') {
    return;
  }

  // Bypass system authorization, custom wallet flows, direct cloud storage transactions, and specific dynamic settings/packages/memberships collections
  if (
    url.pathname.startsWith('/api/') || 
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.pathname.includes('packages') ||
    url.pathname.includes('memberships') ||
    url.search.includes('packages') ||
    url.search.includes('memberships')
  ) {
    return;
  }

  // Handle caching strategy: Network-First with Cache Fallback for source modules, css and html
  // This allows the latest developer code modifications to reflect instantly when connected,
  // but keeps the whole app perfectly running when offline.
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Only cache successful standard HTTP/HTTPS schemes to avoid caching extension or error responses
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch((error) => {
        console.warn(`[Service Worker] Network offline/unreachable for: ${url.pathname}. Accessing fallback cache.`);
        
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // For HTML navigations, fallback to the main cached spa document index.html
          if (request.mode === 'navigate') {
            return caches.match('/') || caches.match('/index.html');
          }

          return new Response(
            JSON.stringify({ 
              error: 'Offline', 
              message: 'Your system is currently offline. Static resource not pre-cached yet.' 
            }), 
            {
              status: 503,
              statusText: 'Offline Fallback Active',
              headers: new Headers({ 'Content-Type': 'application/json' })
            }
          );
        });
      })
  );
});

// Handle notification clicks — open the target URL when user taps a notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/cafe';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
