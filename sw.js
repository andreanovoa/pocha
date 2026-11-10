/* Pocha — service worker: la app abre sin conexión y se actualiza sola. */
/* Pocha — service worker: the app opens offline and updates itself. */
var CACHE = 'pocha-v2';
var SHELL = [
  '/pocha/',
  '/pocha/app.css',
  '/pocha/app.js',
  '/pocha/i18n.js',
  '/pocha/cloud.js',
  '/pocha/firebase-config.js',
  '/pocha/manifest.webmanifest',
  '/pocha/icons/icon-192.png',
  '/pocha/icons/apple-touch-icon.png'
];
// librerías y fuentes de otros dominios que la página carga / libraries and fonts the page loads from other hosts
var CDN = ['www.gstatic.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keep(request, response) {
  if (response && (response.ok || response.type === 'opaque')) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
  }
  return response;
}

// red primero, con la copia guardada si la red tarda o falla
// network first, falling back to the stored copy when the network is slow or down
function networkFirst(request) {
  return new Promise(function (resolve) {
    var settled = false;
    function fromCache() {
      return caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(function (hit) {
        return hit || (request.mode === 'navigate' ? caches.match('/pocha/') : null);
      });
    }
    var timer = setTimeout(function () {
      fromCache().then(function (hit) { if (hit && !settled) { settled = true; resolve(hit); } });
    }, 3000);
    fetch(request).then(function (response) {
      clearTimeout(timer);
      keep(request, response);
      if (!settled) { settled = true; resolve(response); }
    }).catch(function () {
      clearTimeout(timer);
      fromCache().then(function (hit) {
        if (settled) return;
        settled = true;
        resolve(hit || Response.error());
      });
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function (hit) {
    var refresh = fetch(request).then(function (response) { return keep(request, response); });
    return hit || refresh;
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CDN.indexOf(url.hostname) !== -1) {
    event.respondWith(cacheFirst(request));
  }
  // el resto (cuentas, Firestore) va directo a la red / everything else (accounts, Firestore) goes straight to the network
});

// la página pasa los ficheros que cargó antes de que el service worker la controlara
// the page passes on the files it loaded before the service worker took control of it
self.addEventListener('message', function (event) {
  var urls = event.data && event.data.cache;
  if (!Array.isArray(urls)) return;
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(urls.map(function (u) {
      var url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin && CDN.indexOf(url.hostname) === -1) return null;
      return cache.match(u).then(function (hit) {
        if (hit) return null;
        var mode = url.origin === self.location.origin ? 'same-origin' : 'no-cors';
        return fetch(new Request(u, { mode: mode })).then(function (r) { return keep(u, r); }).catch(function () {});
      });
    }));
  }));
});
