const CACHE = "memory-shell-v2";
const PUBLIC_ASSETS = [
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];
function isStaticResponse(response) {
  return (
    response.ok &&
    !response.redirected &&
    response.type !== "opaque" &&
    /^(?:text\/(?:css|javascript)|application\/(?:javascript|manifest\+json)|image\/(?:svg\+xml|png))(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  );
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        PUBLIC_ASSETS.map(async (path) => {
          const response = await fetch(path, {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (isStaticResponse(response)) await cache.put(path, response);
        }),
      ),
    ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (
    !PUBLIC_ASSETS.includes(url.pathname) &&
    !/^\/assets\/[\w.-]+\.(js|css)$/.test(url.pathname)
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isStaticResponse(response)) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((response) => response || Response.error()),
      ),
  );
});
