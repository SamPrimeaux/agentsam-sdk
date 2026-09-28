import { useEffect, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { getTauriInvoke, isPackagedDesktop } from "@/lib/desktop/tauri";

type StartupState = "pending" | "ready" | "optional" | "error";

export function DesktopStartupOverlay() {
  const [visible, setVisible] = useState(() => isPackagedDesktop());
  const [states, setStates] = useState<Record<string, StartupState>>({
    bundle: "ready",
    daemon: "pending",
    filesystem: "pending",
    account: "optional",
  });

  useEffect(() => {
    if (!visible) return;
    const invoke = getTauriInvoke();
    if (!invoke) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      invoke("ensure_agentsamd", {}).then((value) => {
        const ok = Boolean((value as { ok?: boolean })?.ok);
        if (!cancelled) setStates((current) => ({ ...current, daemon: ok ? "ready" : "error" }));
      }),
      invoke("local_content_bridge", {
        requestJson: JSON.stringify({ op: "status" }),
      }).then(() => {
        if (!cancelled) setStates((current) => ({ ...current, filesystem: "ready" }));
      }),
    ]).finally(() => {
      window.setTimeout(() => {
        if (!cancelled) setVisible(false);
      }, 650);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;
  const rows = [
    ["Local Studio bundle", states.bundle],
    ["agentsamd", states.daemon],
    ["local filesystem", states.filesystem],
    ["account session", states.account],
  ] as const;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/90 backdrop-blur-sm">
      <div className="w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-5 shadow-2xl">
        <p className="text-sm font-medium">Starting local runtime…</p>
        <div className="mt-4 grid gap-2">
          {rows.map(([label, state]) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              {state === "pending" ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : state === "ready" ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span>{label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {state === "optional" ? "optional" : state}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
