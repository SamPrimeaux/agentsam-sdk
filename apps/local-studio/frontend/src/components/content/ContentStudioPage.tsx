import { useEffect, useMemo, useState } from "react";
import { ContentStudio } from "@inneranimalmedia/agentsam-content-studio";
import type { ContentRuntime } from "@inneranimalmedia/agentsam-content";
import { createLocalStudioContentRuntime } from "@/lib/content/createLocalStudioContentRuntime";

/**
 * Local Studio gallery entry — mounts portable Content Studio on a real host runtime.
 */
export function ContentStudioPage() {
  const runtime = useMemo(() => createLocalStudioContentRuntime(), []);
  const [capsLabel, setCapsLabel] = useState("loading capabilities…");
  const [localLabel, setLocalLabel] = useState("probing local host…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const caps = await runtime.capabilities();
        if (cancelled) return;
        const providers = caps.providers.map((p) => p.id);
        const local = caps.local.availability;
        setCapsLabel(
          providers.length
            ? `capabilities · ${providers.join(", ")} · local:${local}`
            : `capabilities · local:${local}`,
        );
      } catch (err) {
        if (!cancelled) setCapsLabel(`capabilities unavailable · ${String(err)}`);
      }
      try {
        const status = await runtime.localHost.status();
        if (!cancelled) {
          setLocalLabel(
            `${status.availability}${status.label ? ` · ${status.label}` : ""}`,
          );
        }
      } catch {
        if (!cancelled) setLocalLabel("local host unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Content Studio</span>
        <span className="truncate pl-4">
          {capsLabel} · {localLabel}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <ContentStudioShell runtime={runtime} />
      </div>
    </div>
  );
}

function ContentStudioShell({ runtime }: { runtime: ContentRuntime }) {
  return <ContentStudio runtime={runtime} showAssistant />;
}
