/**
 * The hosted and bundled Studio currently require an online, authoritative
 * identity/CMS API. Until a tested offline data contract ships, do not cache
 * entire admin documents: a stale HTML shell can request JS chunks removed by
 * a newer deployment and strand editors on a blank page.
 */
const LEGACY_CACHE_PREFIX = "agentsam-work-shell-";

export function registerOfflineShell() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Only opt in when a product explicitly ships its offline data contract.
  // The current Local Studio desktop manifest declares offline_shell=false.
  if (import.meta.env.VITE_OFFLINE_SHELL !== "true") {
    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter((registration) => {
          const workerUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
          if (!workerUrl) return false;
          const path = new URL(workerUrl).pathname;
          return new URL(workerUrl).origin === window.location.origin && path === "/sw.js";
        }).map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith(LEGACY_CACHE_PREFIX)).map((key) => window.caches.delete(key)));
        }
      } catch {
        // An unavailable service-worker API must never block authenticated Studio.
      }
    })();
    return;
  }

  const register = () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // Explicit offline mode may be unavailable on some preview hosts.
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
