const CACHE_NAME = 'fintrack-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/analytics.js',
  './js/auth_init.js',
  './js/goals_loans.js',
  './js/import.js',
  './js/p2p.js',
  './js/profile_banks.js',
  './js/reminders.js',
  './js/store.js',
  './js/theme_nav.js',
  './js/transactions.js',
  './js/utils.js'
  './manifest.json',
  './icon.svg',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Stale-while-revalidate for everything
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(netRes => {
        // Only cache GET requests
        if (e.request.method === 'GET' && netRes.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, netRes.clone()));
        }
        return netRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
