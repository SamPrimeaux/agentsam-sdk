export function registerOfflineShell() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* install may fail on some preview hosts — non-fatal */
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
