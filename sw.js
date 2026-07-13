/* ==========================================================================
   Service Worker · estrategia NETWORK-FIRST para el shell.
   Con internet siempre sirve lo último (evita quedarse con versiones viejas
   cacheadas); sin internet, cae a la última copia en cache. Los DATOS van
   siempre por red a Supabase (nunca se cachean).
   Sube CACHE_VERSION al cambiar el shell.
   ========================================================================== */

const CACHE_VERSION = "ft-shell-v7";

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
  "./js/ui.js",
  "./js/dnd.js",
  "./js/exercise-icons.js",
  "./js/views/dashboard.js",
  "./js/views/routine.js",
  "./js/views/workout.js",
  "./js/views/history.js",
  "./js/views/nutrition.js",
  "./js/views/exercises.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const CDN_HOSTS = ["cdn.jsdelivr.net"];

self.addEventListener("install", (event) => {
  // Activa la nueva versión de inmediato, sin esperar a cerrar pestañas.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Datos de Supabase: SIEMPRE red, sin tocar cache.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isCdn) return;

  // Network-first: intenta la red; si funciona, actualiza cache y devuelve.
  // Si falla (offline), devuelve lo que haya en cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
