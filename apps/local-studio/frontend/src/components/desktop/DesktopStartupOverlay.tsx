import { useEffect } from "react";
import { getTauriInvoke, isPackagedDesktop } from "@/lib/desktop/tauri";

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * Native startup work is deliberately invisible.
 * Local Studio renders immediately; native capabilities hydrate in the background.
 */
export function DesktopStartupOverlay() {
  useEffect(() => {
    if (!isPackagedDesktop()) return;
    const invoke = getTauriInvoke();
    if (!invoke) return;

    void Promise.allSettled([
      settleWithin(invoke("ensure_agentsamd", {}), 5000),
      settleWithin(
        invoke("local_content_bridge", {
          requestJson: JSON.stringify({ op: "status" }),
        }),
        5000,
      ),
    ]);
  }, []);

  return null;
}
