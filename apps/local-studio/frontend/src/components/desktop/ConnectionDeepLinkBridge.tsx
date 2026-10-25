import { useEffect } from "react";
import { isPackagedDesktop, listenDeepLinks } from "@/lib/desktop/tauri";
import {
  SETTINGS_CATALOG_CHANGED_EVENT,
  connectionReturnLocation,
  parseConnectionDeepLink,
} from "@/lib/desktop/connection-deep-link";

/**
 * Brings the desktop app back to Settings after a provider connection finishes in the system
 * browser: refreshes the plugin registry (which re-probes connection health) and reopens the view.
 */
export function ConnectionDeepLinkBridge() {
  useEffect(() => {
    if (!isPackagedDesktop()) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    void listenDeepLinks((value) => {
      const link = parseConnectionDeepLink(value);
      if (!link) return;
      window.dispatchEvent(new CustomEvent(SETTINGS_CATALOG_CHANGED_EVENT));
      const to = connectionReturnLocation(link);
      if (to) window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to } }));
    })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return null;
}
