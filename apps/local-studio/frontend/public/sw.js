/* AgentSam Local Studio — retire the pre-release offline shell.
 *
 * The current hosted/desktop products do not ship an authenticated offline
 * CMS/API contract. The old v1 worker cached entire navigations and left
 * stale asset references after deployments (404 on hashed JS chunks).
 * Remove only our own legacy caches; do not touch unrelated registrations.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((name) => name.startsWith("agentsam-work-shell-"))
      .map((name) => caches.delete(name)));
    await self.registration.unregister();
  })());
});

// No fetch interception. Current document/JS/CSS and authorized APIs remain
// network-authoritative until an offline mode with real data reconciliation ships.
