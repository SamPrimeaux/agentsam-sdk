import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Settings2 } from "lucide-react";
import { IconAction } from "@/components/ui/icon-action";
import type { LocalStudioSideStageRecord } from "@/lib/connections/client";
import { readLocalStudioPluginWorkspace } from "@/lib/connections/client";

type Props = { stage: LocalStudioSideStageRecord | undefined };

function readableValue(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 2400);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return null;
  if (typeof value === "object" && "text" in value &&
      typeof (value as { text: unknown }).text === "string") {
    return String((value as { text: string }).text).slice(0, 2400);
  }
  return null;
}

/** No arbitrary component imports, host privileges or unsandboxed remote scripts. */
export function PluginSideStage({ stage }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    loading: boolean; error: boolean; result: unknown;
  }>({ loading: true, error: false, result: null });

  useEffect(() => {
    if (!stage || stage.renderer !== "workspace") return;
    let active = true;
    setState({ loading: true, error: false, result: null });
    readLocalStudioPluginWorkspace(stage.pluginId)
      .then(reply => {
        if (active) setState({ loading: false, error: reply.ok !== true, result: reply.result });
      }).catch(() => {
        if (active) setState({ loading: false, error: true, result: null });
      });
    return () => { active = false; };
  }, [stage?.pluginId, stage?.renderer, refresh]);

  if (!stage) return <section role="status" className="p-5 text-sm text-muted-foreground">
    This addition isn't available in your connected plugins.
  </section>;

  if (stage.renderer === "embed") {
    return <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <strong className="truncate text-xs font-semibold">{stage.label}</strong>
        <a href={stage.href} target="_blank" rel="noopener noreferrer"
          aria-label={"Open " + stage.label + " in a separate tab"}
          className="rounded border border-border p-1.5 hover:bg-muted">
          <ExternalLink size={14}/>
        </a>
      </div>
      <iframe
        title={stage.label}
        src={stage.href}
        sandbox={
          typeof window !== "undefined" && stage.href &&
          new URL(stage.href).origin !== window.location.origin
            ? "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            : "allow-scripts allow-forms allow-popups allow-downloads"
        }
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>;
  }

  const output = state.result;
  const primitive = readableValue(output);
  const rows = primitive === null && output && typeof output === "object"
    ? (Array.isArray(output) ? output.map((value, index) => [String(index + 1), value] as const)
      : Object.entries(output as Record<string, unknown>)).slice(0, 60) : [];

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <div className="flex h-10 items-center justify-between border-b border-border px-3">
      <strong className="truncate text-xs font-semibold">{stage.label}</strong>
      <div className="flex items-center gap-1">
        <IconAction label="Refresh plugin workspace" hint="Reload the connected plugin workspace"
          variant="outline" className="rounded p-1.5"
          onClick={() => setRefresh(x => x + 1)}>
          <RefreshCw size={14}/>
        </IconAction>
        <IconAction label="Manage plugin connection" hint="Review installed plugin settings"
          variant="outline" className="rounded p-1.5"
          onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", {
            detail: { to: "/settings/customize?view=plugins" },
          }))}>
          <Settings2 size={14}/>
        </IconAction>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
      {state.loading
        ? <p role="status" className="text-muted-foreground">Opening workspace…</p>
        : state.error
          ? <p role="alert" className="text-muted-foreground">
              The plugin workspace couldn't be opened. Review its connection and retry.
            </p>
          : primitive !== null
            ? <p className="whitespace-pre-wrap break-words">{primitive}</p>
            : rows.length
              ? <dl className="space-y-3">{rows.map(([key, value]) => {
                  const description = readableValue(value);
                  return description === null ? null : <div key={key}
                    className="border-b border-border pb-2">
                    <dt className="mb-1 text-xs text-muted-foreground">
                      {key.replace(/[_-]/g, " ")}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">{description}</dd>
                  </div>;
                })}</dl>
              : <p role="status" className="text-muted-foreground">
                  No workspace details were returned by this plugin.
                </p>}
    </div>
  </div>;
}
