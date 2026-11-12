import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listLocalStudioSideStages,
  updateSideStageVisibility,
  type LocalStudioSideStageRecord,
} from "@/lib/connections/client";
import { reloadSideStageRegistry } from "../../../agentsam/side-stage-actions";

/** Account-owned view: listing a native panel is NOT a plugin connection or app entitlement. */
export function SideStagePreferencesPage() {
  const [items, setItems] = useState<LocalStudioSideStageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const catalog = await listLocalStudioSideStages();
      setItems(catalog.filter(item => item.renderer === "builtin"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your panels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function setEnabled(item: LocalStudioSideStageRecord, enabled: boolean) {
    setPending(item.pluginId);
    setError("");
    try {
      await updateSideStageVisibility(item.pluginId, enabled);
      setItems(current => current.map(candidate => candidate.pluginId === item.pluginId ? {...candidate,enabled} : candidate));
      await reloadSideStageRegistry();
      toast.success(enabled ? item.label + " is available in Side Stage" : item.label + " hidden from Side Stage");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save panel preference.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Side Stage panels</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Decide which built-in workspaces appear in the + menu. Hiding a panel does not delete its files or history, uninstall an app, or revoke a connection.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || pending !== null}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs text-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading your panel preferences…</p>
      ) : items.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map(item => (
            <label key={item.pluginId} className="flex min-h-16 cursor-pointer items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30">
              <span className="flex min-w-0 items-center gap-3">
                {item.iconUrl ? <img src={item.iconUrl} alt="" className="size-8 shrink-0 rounded object-contain" /> : null}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description || "Built-in workspace panel"}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {pending === item.pluginId ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : null}
                <input type="checkbox" checked={Boolean(item.enabled)}
                  onChange={event => void setEnabled(item,event.target.checked)}
                  disabled={pending !== null}
                  aria-label={"Show " + item.label + " in Side Stage"}
                  className="size-4 accent-primary disabled:opacity-50" />
              </span>
            </label>
          ))}
        </div>
      ) : !error ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No built-in panels are registered for this account.</p> : null}
      <p className="text-xs text-muted-foreground">Applications and external extensions are managed separately. These controls only affect your panel shortcuts.</p>
    </section>
  );
}
