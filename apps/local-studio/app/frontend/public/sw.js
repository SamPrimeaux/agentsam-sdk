/* AgentSam Work — offline shell cache for CLI-on-the-go */
const CACHE = "agentsam-work-shell-v1";
const PRECACHE = ["/", "/trails", "/cli", "/projects", "/artifacts", "/files", "/ship", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok && (request.mode === "navigate" || url.pathname.match(/\.(js|css|svg|png|woff2?)$/))) {
          const cache = await caches.open(CACHE);
          void cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const fallback = (await caches.match("/trails")) || (await caches.match("/")) || (await caches.match("/cli"));
          if (fallback) return fallback;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })(),
  );
});
