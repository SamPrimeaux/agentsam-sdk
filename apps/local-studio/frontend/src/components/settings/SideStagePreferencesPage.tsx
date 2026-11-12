import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, Search, Layers3, PanelRight, LayoutPanelTop } from "lucide-react";
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
  const [query,setQuery] = useState("");
  const filtered = items.filter(item => [item.label,item.description,item.stageId]
    .some(value=>value?.toLowerCase().includes(query.trim().toLowerCase())));
  const appStages = new Set(["cad", "media", "canvas"]);

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
          <h2 className="text-lg font-semibold text-foreground">Side Stage shortcuts</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose which workspaces open alongside your conversation. Editor apps such as CAD Creator and MovieMode keep their full standalone routes; hiding a Side Stage shortcut never uninstalls them or deletes their work.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || pending !== null}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs text-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>
      <label className="flex max-w-2xl items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input type="search" aria-label="Search Side Stage shortcuts" placeholder="Search editor apps and workspaces"
          value={query} onChange={event=>setQuery(event.target.value)}
          className="w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"/>
      </label>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading your panel preferences…</p>
      ) : filtered.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {filtered.map(item => (
            <label key={item.pluginId} className="flex min-h-16 cursor-pointer items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30">
              <span className="flex min-w-0 items-center gap-3">
                {item.iconUrl ? <img src={item.iconUrl} alt="" className="size-8 shrink-0 rounded object-contain" /> :
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted/30 text-muted-foreground">
                    {item.stageId==='canvas'?<LayoutPanelTop className="size-4"/>:appStages.has(item.stageId)?<Layers3 className="size-4"/>:<PanelRight className="size-4"/>}
                  </span>}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description || "Built-in workspace"}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{appStages.has(item.stageId)?"Available in Side Stage and its own editor":"Side Stage workspace utility"}</span>
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
      ) : !error ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{items.length?"No shortcuts match your search.":"No Side Stage shortcuts are registered for this account."}</p> : null}
      <p className="text-xs text-muted-foreground">Use the Apps tab to install or remove an application. Use Plugins to manage external connections and capabilities. This page controls only the Side Stage shortcuts.</p>
    </section>
  );
}
