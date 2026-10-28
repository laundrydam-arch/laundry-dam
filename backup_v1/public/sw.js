const CACHE_NAME = "damdamlaundry-cache-v3";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/pwa_icon.png",
  "/pwa_icon_512.png",
  "/pwa_icon_192.png",
  "/screenshot_wide.png",
  "/screenshot_narrow.png"
];

// Installs service worker and caches core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Cleans up stale caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Listen to message for skipWaiting
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Network-First with Cache Fallback for local assets (ensures immediate updates when online)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  // Only handle local queries
  if (url.origin !== self.location.origin) {
    return;
  }

  // Bypass if it's hot-reload or special dev-server URLs
  if (url.pathname.includes("@vite") || url.pathname.includes("node_modules") || url.pathname.includes("@fs")) {
    return;
  }

  // Network-First strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If successful, clone and store in cache
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If offline and request is HTML document, return root template if possible
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
        });
      })
  );
});
