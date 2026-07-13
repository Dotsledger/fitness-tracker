/* ==========================================================================
   Service Worker · cache del "shell" de la app.
   Los DATOS nunca se cachean: siempre van por red a Supabase.
   Estrategia:
     - Peticiones a Supabase o cross-origin de datos -> network only.
     - Assets del shell (mismo origen) + CDNs de librerías -> stale-while-revalidate.
   Sube CACHE_VERSION cuando cambies archivos del shell para invalidar la cache.
   ========================================================================== */

const CACHE_VERSION = "ft-shell-v3";

// Archivos del shell (rutas relativas al scope del SW).
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/router.js",
  "./js/db.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/macros.js",
  "./js/charts.js",
  "./js/views/dashboard.js",
  "./js/views/routine.js",
  "./js/views/workout.js",
  "./js/views/history.js",
  "./js/views/nutrition.js",
  "./js/views/exercises.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Librerías externas que también cacheamos para que la app abra offline.
const CDN_HOSTS = ["cdn.jsdelivr.net"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Datos de Supabase (o cualquier API *.supabase.co): SIEMPRE red, sin cache.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) {
    return; // deja pasar a la red por defecto
  }

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_HOSTS.includes(url.hostname);

  if (!sameOrigin && !isCdn) return; // otras terceras partes: red normal

  // stale-while-revalidate para shell + CDNs.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
