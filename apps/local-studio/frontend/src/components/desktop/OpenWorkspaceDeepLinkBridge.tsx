import { useEffect } from "react";
import { isPackagedDesktop, listenDeepLinks, openDesktopWorkspace } from "@/lib/desktop/tauri";
import {
  OPEN_WORKSPACE_EVENT,
  OPEN_WORKSPACE_FAILED_EVENT,
  parseOpenDeepLink,
} from "@/lib/desktop/open-deep-link";

/**
 * `agentsam .` / `agentsam <dir>` land here. The native side re-validates the path and owns the
 * opened workspace; every consumer reads it through getDesktopWorkspaceContext().
 */
export function OpenWorkspaceDeepLinkBridge() {
  useEffect(() => {
    if (!isPackagedDesktop()) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    void listenDeepLinks((value) => {
      const path = parseOpenDeepLink(value);
      if (!path) return;
      openDesktopWorkspace(path)
        .then((context) => window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: context })))
        .catch((error) => {
          const reason = String(error?.message ?? error);
          console.warn("[agentsam] could not open workspace:", reason);
          window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_FAILED_EVENT, { detail: { error: reason } }));
        });
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
