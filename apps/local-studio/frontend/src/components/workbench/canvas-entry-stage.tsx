import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { useWorkStore } from "@/lib/work/store";

type Site = { id: string; name: string; primary_domain?: string };
type Theme = { id: string; name: string; edit_href?: string; site_id?: string };
type StoreResponse = {
  ok: boolean;
  available_sites?: Site[];
  selected_site_id?: string | null;
  draft_themes?: Theme[];
};

const SITE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,160}$/;

export function CanvasEntryStage({ tab }: { tab: SideTab }) {
  const setTabUrl = useWorkStore(state => state.setTabUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [view, setView] = useState<{loading: boolean; error: boolean;
    sites: Site[]; selected: string; themes: Theme[]}>({
    loading: true, error: false, sites: [], selected: "", themes: [],
  });
  const [revision, setRevision] = useState(0);
  const [requestedSite, setRequestedSite] = useState<string | null>(null);
  const hasDocument = Boolean(tab.url && tab.url.startsWith("/admin/theme-project-editor?"));

  useEffect(() => {
    if (hasDocument) return;
    let active = true;
    const requested = requestedSite ?? (() => {
      try { return sessionStorage.getItem("agentsam.cms.selected-site.v1"); }
      catch { return null; }
    })();
    const query = requested && SITE_ID.test(requested)
      ? "?site_id=" + encodeURIComponent(requested) : "";
    setView(v => ({ ...v, loading: true, error: false }));
    fetch("/api/admin/store/online" + query, { credentials: "same-origin" })
      .then(async response => {
        if (!response.ok) throw new Error("store_request_failed");
        return response.json() as Promise<StoreResponse>;
      }).then(result => {
        if (!result.ok || (requested && result.selected_site_id !== requested)) {
          throw new Error("store_unavailable");
        }
        const sites = (result.available_sites ?? []).filter(item =>
          SITE_ID.test(item.id) && Boolean(item.name));
        const selected = sites.some(item => item.id === result.selected_site_id)
          ? result.selected_site_id! : "";
        if (active) setView({ loading: false, error: false, sites, selected,
          themes: (result.draft_themes ?? []).filter(theme =>
            PROJECT_ID.test(theme.id) && theme.site_id === selected) });
      }).catch(() => {
        if (active) setView({ loading: false, error: true, sites: [], selected: "", themes: [] });
      });
    return () => { active = false; };
  }, [hasDocument, revision, requestedSite]);

  // The nested authorized CMS editor reports its real canonical project URL.
  // Reopening a collapsed panel uses that URL, never repeats new=1.
  useEffect(() => {
    if (!hasDocument) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin ||
          event.source !== iframeRef.current?.contentWindow) return;
      const detail = event.data;
      if (!detail || detail.type !== "agentsam:cms-canvas:route" ||
          !SITE_ID.test(detail.siteId) || !PROJECT_ID.test(detail.projectId) ||
          typeof detail.href !== "string") return;
      const next = new URL(detail.href, location.origin);
      if (next.origin !== location.origin || next.pathname !== "/admin/theme-project-editor" ||
          next.searchParams.get("site_id") !== detail.siteId ||
          next.searchParams.get("project") !== detail.projectId ||
          next.searchParams.has("new")) return;
      if (tab.url !== next.pathname + next.search) setTabUrl(tab.id, next.pathname + next.search);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hasDocument, setTabUrl, tab.id, tab.url]);

  function openSite(site: string, project?: string) {
    if (!SITE_ID.test(site) || (project && !PROJECT_ID.test(project))) return;
    try { sessionStorage.setItem("agentsam.cms.selected-site.v1", site); }
    catch { /* still authorized server-side */ }
    const query = new URLSearchParams({ site_id: site });
    if (project) query.set("project", project);
    else query.set("new", "1");
    setTabUrl(tab.id, "/admin/theme-project-editor?" + query);
  }

  if (hasDocument) return <div className="flex h-full min-h-0 flex-col bg-background">
    <div className="flex h-10 items-center justify-between border-b border-border px-3">
      <strong className="truncate text-xs font-semibold">Canvas</strong>
      <div className="flex items-center gap-1">
        <button type="button" className="rounded border border-border px-2 py-1 text-xs"
          onClick={() => setTabUrl(tab.id, "")}>All websites</button>
        <a href={tab.url} className="rounded border border-border p-1.5 hover:bg-muted"
          target="_blank" rel="noopener noreferrer" aria-label="Open Canvas full screen">
          <ExternalLink size={14}/>
        </a>
      </div>
    </div>
    <iframe ref={iframeRef} title="Website Canvas" src={tab.url}
      className="min-h-0 w-full flex-1 border-0 bg-background" />
  </div>;

  return <div className="flex h-full min-h-0 flex-col bg-background p-5">
    <header className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">New Canvas</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose an existing website to create a private editable design.
        </p>
      </div>
      <button type="button" className="rounded border border-border p-2"
        aria-label="Refresh websites" onClick={() => setRevision(n => n + 1)}>
        <RefreshCw size={15}/>
      </button>
    </header>
    {view.loading ? <p role="status" className="text-sm text-muted-foreground">
      Loading websites…
    </p> : view.error ? <div role="alert" className="space-y-3 text-sm">
      <p>Your websites couldn't be loaded.</p>
      <button className="rounded border px-3 py-1.5"
        type="button" onClick={() => setRevision(n => n + 1)}>Retry</button>
    </div> : !view.sites.length ? <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">No website is available in this account.</p>
      <a className="inline-block rounded border px-3 py-1.5" href="/admin/store">
        Open Online Store
      </a>
    </div> : <>
      <label className="mb-3 flex flex-col gap-2 text-xs font-medium">
        Website
        <select className="rounded border border-border bg-background p-2 text-sm"
          value={view.selected} onChange={event => {
            const siteId = event.target.value;
            setView(v => ({ ...v, selected: siteId, themes: [] }));
            if (siteId) setRequestedSite(siteId);
          }}>
          <option value="">Choose a website</option>
          {view.sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
      </label>
      {view.selected && <button type="button"
        onClick={() => openSite(view.selected)}
        className="inline-flex items-center justify-center gap-2 rounded border border-border bg-foreground px-3 py-2 text-sm font-medium text-background">
        <Plus size={15}/> Create Canvas
      </button>}
      {view.selected && view.themes.length > 0 && <>
        <h3 className="mb-2 mt-8 text-xs font-semibold">Existing designs</h3>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto">
          {view.themes.map(theme => <button key={theme.id} type="button"
            className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => openSite(view.selected, theme.id)}>
            <span className="truncate">{theme.name}</span>
            <ExternalLink size={13}/>
          </button>)}
        </div>
      </>}
    </>}
  </div>;
}
