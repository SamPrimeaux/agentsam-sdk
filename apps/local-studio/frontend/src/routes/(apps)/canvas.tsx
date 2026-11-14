import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CanvasEntryStage } from "@/components/workbench/canvas-entry-stage";
import { useWorkStore } from "@/lib/work/store";

type CanvasSearch = { canvas?: string; host?: string; site_id?: string; template?: string; library?: "sources" };
const identifier = /^[A-Za-z0-9_-]{1,160}$/;

export const Route = createFileRoute("/(apps)/canvas")({
  validateSearch: (search: Record<string, unknown>): CanvasSearch => ({
    canvas: typeof search.canvas === "string" && identifier.test(search.canvas) ? search.canvas : undefined,
    host: typeof search.host === "string" && identifier.test(search.host) ? search.host : undefined,
    site_id: typeof search.site_id === "string" && identifier.test(search.site_id) ? search.site_id : undefined,
    template: typeof search.template === "string" && identifier.test(search.template) ? search.template : undefined,
    library: search.library === "sources" ? "sources" : undefined,
  }),
  component: CanvasPage,
});

/** Full-stage presentation of the same Work resource and editor. */
function CanvasPage() {
  const search = Route.useSearch();
  const hydrated = useWorkStore(state => state.hydrated);
  const [tabId, setTabId] = useState<string | null>(null);
  const tab = useWorkStore(state => state.sideTabs.find(item => item.id === tabId));
  const initialized = useRef(false);
  useEffect(() => {
    if (!hydrated || initialized.current) return;
    initialized.current = true;
    const query = new URLSearchParams();
    if (search.canvas) query.set("canvas", search.canvas);
    if (search.host) query.set("host", search.host);
    if (search.site_id) query.set("site_id", search.site_id);
    if (search.template) query.set("template", search.template);
    if (search.library) query.set("library", search.library);
    const id = useWorkStore.getState().openSideTab("design", {
      title: "Canvas", ephemeral: false, url: "/canvas" + (query.size ? "?" + query : ""),
    });
    setTabId(id);
  }, [hydrated, search]);
  return <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background" data-design-workspace="canvas">
    {tab ? <CanvasEntryStage tab={tab} /> : <div role="status" className="grid h-full place-items-center text-sm text-muted-foreground">Opening Canvas…</div>}
  </div>;
}
