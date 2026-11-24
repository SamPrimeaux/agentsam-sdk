import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, History, Plus, Save, Trash2 } from "lucide-react";
import { createHttpCmsAdapter } from "@inneranimalmedia/ecommerce-cms-agentsam/cms";

type Site = { id: string; name?: string | null; slug?: string | null; is_default?: boolean };
type MenuLink = { id: string; label: string; href: string; target?: string };
type FooterGroup = { key: string; label: string; items: MenuLink[] };
type Menu = {
  id: string;
  site_id: string;
  handle: string;
  title: string;
  status: "draft" | "active" | "archived";
  layout: "links" | "grouped-footer";
  items: MenuLink[];
  groups: FooterGroup[];
  read_only?: boolean;
  updated_at: string;
};
type Revision = { id: string; revision_number: number; revision_kind: string; created_at: string };

function cloneMenu(menu: Menu): Menu {
  return JSON.parse(JSON.stringify(menu)) as Menu;
}

function fromCmsMenu(menu: any): Menu {
  return {
    id: menu.id,
    site_id: menu.siteId,
    handle: menu.handle,
    title: menu.title,
    status: menu.status,
    layout: menu.layout,
    items: Array.isArray(menu.items) ? menu.items : [],
    groups: Array.isArray(menu.groups) ? menu.groups : [],
    read_only: Boolean(menu.readOnly),
    updated_at: menu.updatedAt || "",
  };
}

function newLink(): MenuLink {
  return { id: "nav-" + Date.now().toString(36), label: "New link", href: "/" };
}

async function jsonResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || "Navigation request failed");
  return body;
}

export function WebsiteNavigationSettings({ initialSiteId, initialSiteSlug }: { initialSiteId?: string; initialSiteSlug?: string }) {
  const cmsAdapter = useMemo(() => createHttpCmsAdapter(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState(initialSiteId || "");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [draft, setDraft] = useState<Menu | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/admin/cms/sites", { credentials: "same-origin", signal: controller.signal });
        const result = await jsonResponse(response);
        const available = Array.isArray(result.sites) ? result.sites : [];
        if (controller.signal.aborted) return;
        setSites(available);
        const selected = available.find((site: Site) => site.id === initialSiteId)?.id ||
          available.find((site: Site) => site.slug === initialSiteSlug)?.id ||
          result.default_site_id || available[0]?.id || "";
        setSiteId(selected);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load websites");
      } finally {
        if (!controller.signal.aborted) setLoadingSites(false);
      }
    })();
    return () => controller.abort();
  }, [initialSiteId, initialSiteSlug]);

  const selectedMenu = useMemo(() => menus.find(menu => menu.id === selectedMenuId) || null, [menus, selectedMenuId]);

  const loadMenus = async (selectedSiteId: string) => {
    if (!selectedSiteId) return;
    setLoadingMenus(true);
    setError("");
    try {
      const available = (await cmsAdapter.listNavigationMenus(selectedSiteId)).map(fromCmsMenu);
      setMenus(available);
      const next = available.find(menu => menu.id === selectedMenuId) || available.find(menu => menu.status !== "archived") || available[0] || null;
      setSelectedMenuId(next?.id || "");
      setDraft(next ? cloneMenu(next) : null);
      setDirty(false);
      setRevisions([]);
      setHistoryOpen(false);
    } catch (cause) {
      setMenus([]);
      setDraft(null);
      setError(cause instanceof Error ? cause.message : "Could not load website menus");
    } finally {
      setLoadingMenus(false);
    }
  };

  useEffect(() => {
    if (siteId) void loadMenus(siteId);
  }, [siteId]);

  const updateDraft = (change: Partial<Menu>) => {
    setDraft(current => current ? { ...current, ...change } : current);
    setDirty(true);
    setNotice("");
  };

  const updateItem = (index: number, change: Partial<MenuLink>) => {
    if (!draft) return;
    const items = [...draft.items];
    items[index] = { ...items[index], ...change };
    updateDraft({ items });
  };

  const moveItem = (index: number, delta: number) => {
    if (!draft) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= draft.items.length) return;
    const items = [...draft.items];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    updateDraft({ items });
  };

  const updateGroup = (index: number, change: Partial<FooterGroup>) => {
    if (!draft) return;
    const groups = [...draft.groups];
    groups[index] = { ...groups[index], ...change };
    updateDraft({ groups });
  };

  const updateGroupItem = (groupIndex: number, itemIndex: number, change: Partial<MenuLink>) => {
    if (!draft) return;
    const groups = [...draft.groups];
    const items = [...groups[groupIndex].items];
    items[itemIndex] = { ...items[itemIndex], ...change };
    groups[groupIndex] = { ...groups[groupIndex], items };
    updateDraft({ groups });
  };

  const moveGroupItem = (groupIndex: number, itemIndex: number, delta: number) => {
    if (!draft) return;
    const groups = [...draft.groups];
    const items = [...groups[groupIndex].items];
    const nextIndex = itemIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    [items[itemIndex], items[nextIndex]] = [items[nextIndex], items[itemIndex]];
    groups[groupIndex] = { ...groups[groupIndex], items };
    updateDraft({ groups });
  };

  const save = async () => {
    if (!draft || !siteId || saving || !dirty) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = fromCmsMenu(await cmsAdapter.updateNavigationMenu(siteId, draft.id, {
        handle: draft.handle, title: draft.title, status: draft.status,
        layout: draft.layout, items: draft.items, groups: draft.groups,
        expectedUpdatedAt: selectedMenu?.updated_at || "",
      }));
      setMenus(current => current.map(menu => menu.id === saved.id ? saved : menu));
      setDraft(cloneMenu(saved));
      setDirty(false);
      setNotice("Menu saved. The storefront now reads this CMS menu.");
      if (historyOpen) await loadHistory(saved.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this menu");
    } finally {
      setSaving(false);
    }
  };

  const createMenu = async () => {
    if (!siteId || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const title = "New menu";
    const handle = "menu-" + Date.now().toString(36);
    try {
      const created = fromCmsMenu(await cmsAdapter.createNavigationMenu(siteId, {
        handle, title, status: "draft", layout: "links", items: [], groups: [],
      }));
      setMenus(current => [...current, created].sort((a, b) => a.handle.localeCompare(b.handle)));
      setSelectedMenuId(created.id);
      setDraft(cloneMenu(created));
      setDirty(false);
      setNotice("New draft menu created.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a menu");
    } finally {
      setSaving(false);
    }
  };

  const archiveMenu = async () => {
    if (!draft || !selectedMenu || saving) return;
    if (!window.confirm("Archive this menu? It will no longer be used by the storefront.")) return;
    setSaving(true);
    setError("");
    try {
      const archived = fromCmsMenu(await cmsAdapter.archiveNavigationMenu(siteId, draft.id, selectedMenu.updated_at));
      setMenus(current => current.map(menu => menu.id === archived.id ? archived : menu));
      setDraft(cloneMenu(archived));
      setDirty(false);
      setNotice("Menu archived.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not archive this menu");
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async (menuId: string) => {
    if (!siteId) return;
    try {
      const result = await cmsAdapter.listNavigationRevisions(siteId, menuId);
      setRevisions(result.map(revision => ({
        id: revision.id,
        revision_number: revision.revisionNumber,
        revision_kind: revision.revisionKind,
        created_at: revision.createdAt,
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load menu history");
    }
  };

  const toggleHistory = async () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && draft) await loadHistory(draft.id);
  };

  const selectMenu = (id: string) => {
    if (dirty && !window.confirm("Discard unsaved menu changes?")) return;
    const next = menus.find(menu => menu.id === id) || null;
    setSelectedMenuId(id);
    setDraft(next ? cloneMenu(next) : null);
    setDirty(false);
    setRevisions([]);
    setHistoryOpen(false);
    setError("");
    setNotice("");
  };

  if (loadingSites) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading websites…</div>;
  if (!sites.length) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No CMS websites are available for this account yet.</div>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Website
          <select value={siteId} onChange={event => {
            if (dirty && !window.confirm("Discard unsaved menu changes?")) return;
            setSiteId(event.target.value);
          }} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {sites.map(site => <option key={site.id} value={site.id}>{site.name || site.slug || site.id}{site.is_default ? " · Default" : ""}</option>)}
          </select>
        </label>
        <button type="button" onClick={createMenu} disabled={saving || loadingMenus} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
          <Plus size={16} /> New menu
        </button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{notice}</div>}

      {loadingMenus ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading menus…</div>
      ) : !menus.length ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold">No navigation menus yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create a menu here. Website headers and footers read their published menus from the CMS navigation table.</p>
          <button type="button" onClick={createMenu} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Plus size={16} /> Create menu</button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menus</div>
            <div className="grid gap-1">
              {menus.map(menu => (
                <button key={menu.id} type="button" onClick={() => selectMenu(menu.id)} className={"flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm " + (selectedMenuId === menu.id ? "bg-muted font-semibold" : "hover:bg-muted/60")}>
                  <span className="min-w-0 truncate">{menu.title}</span>
                  <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{menu.status}</span>
                </button>
              ))}
            </div>
          </aside>

          {draft && selectedMenu ? (
            <section className="min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">Menu title
                    <input value={draft.title} onChange={event => updateDraft({ title: event.target.value })} maxLength={120} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">Handle
                    <input value={draft.handle} onChange={event => updateDraft({ handle: event.target.value })} maxLength={64} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">Format
                    <select value={draft.layout} onChange={event => updateDraft({ layout: event.target.value as Menu["layout"] })} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                      <option value="links">Link list</option>
                      <option value="grouped-footer">Grouped footer</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">Status
                    <select value={draft.status} onChange={event => updateDraft({ status: event.target.value as Menu["status"] })} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                      <option value="draft">Draft</option>
                      <option value="active">Active / published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button type="button" onClick={toggleHistory} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><History size={15} /> History</button>
                  <button type="button" onClick={save} disabled={!dirty || saving || draft.read_only} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save size={15} /> {saving ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={archiveMenu} disabled={saving || draft.status === "archived"} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-50"><Trash2 size={15} /> Archive</button>
                </div>
              </div>

              {draft.read_only && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">This menu contains an unrecognized legacy payload. It is preserved and cannot be overwritten until its format is mapped.</p>}

              {draft.layout === "links" ? (
                <div className="mt-4 grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="font-semibold">Menu links</h3><p className="text-xs text-muted-foreground">Links are saved in the site's CMS navigation record.</p></div>
                    <button type="button" onClick={() => updateDraft({ items: [...draft.items, newLink()] })} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Plus size={15} /> Add link</button>
                  </div>
                  {draft.items.map((item, index) => (
                    <div key={item.id} className="grid min-w-0 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
                      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Label
                        <input value={item.label} onChange={event => updateItem(index, { label: event.target.value })} className="min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
                      </label>
                      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Destination
                        <input value={item.href} onChange={event => updateItem(index, { href: event.target.value })} placeholder="/about or https://example.com" className="min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
                      </label>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label="Move link up" className="rounded-md border border-border p-2 disabled:opacity-30"><ArrowUp size={14} /></button>
                        <button type="button" disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)} aria-label="Move link down" className="rounded-md border border-border p-2 disabled:opacity-30"><ArrowDown size={14} /></button>
                        <button type="button" onClick={() => updateDraft({ items: draft.items.filter((_, itemIndex) => itemIndex !== index) })} aria-label="Remove link" className="rounded-md border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {!draft.items.length && <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">This menu has no links yet.</p>}
                </div>
              ) : (
                <div className="mt-4 grid gap-4">
                  <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Footer groups</h3><p className="text-xs text-muted-foreground">Organize footer links under reusable group headings.</p></div>
                    <button type="button" onClick={() => updateDraft({ groups: [...draft.groups, { key: "group-" + Date.now().toString(36), label: "New group", items: [] }] })} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Plus size={15} /> Add group</button>
                  </div>
                  {draft.groups.map((group, groupIndex) => (
                    <div key={group.key} className="grid gap-3 rounded-lg border border-border p-3">
                      <div className="flex items-end gap-2">
                        <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted-foreground">Group title
                          <input value={group.label} onChange={event => updateGroup(groupIndex, { label: event.target.value })} className="min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
                        </label>
                        <button type="button" onClick={() => updateDraft({ groups: draft.groups.filter((_, index) => index !== groupIndex) })} aria-label="Remove group" className="rounded-md border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                      </div>
                      {group.items.map((item, itemIndex) => (
                        <div key={item.id} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
                          <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Label
                            <input value={item.label} onChange={event => updateGroupItem(groupIndex, itemIndex, { label: event.target.value })} className="min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
                          </label>
                          <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Destination
                            <input value={item.href} onChange={event => updateGroupItem(groupIndex, itemIndex, { href: event.target.value })} className="min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
                          </label>
                          <div className="flex items-center gap-1">
                            <button type="button" disabled={itemIndex === 0} onClick={() => moveGroupItem(groupIndex, itemIndex, -1)} aria-label="Move footer link up" className="rounded-md border border-border p-2 disabled:opacity-30"><ArrowUp size={14} /></button>
                            <button type="button" disabled={itemIndex === group.items.length - 1} onClick={() => moveGroupItem(groupIndex, itemIndex, 1)} aria-label="Move footer link down" className="rounded-md border border-border p-2 disabled:opacity-30"><ArrowDown size={14} /></button>
                            <button type="button" onClick={() => updateGroup(groupIndex, { items: group.items.filter((_, index) => index !== itemIndex) })} aria-label="Remove footer link" className="rounded-md border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => updateGroup(groupIndex, { items: [...group.items, newLink()] })} className="justify-self-start inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Plus size={14} /> Add link</button>
                    </div>
                  ))}
                  {!draft.groups.length && <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No footer groups yet.</p>}
                </div>
              )}

              {historyOpen && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="font-semibold">Revision history</h3>
                  <div className="mt-2 grid gap-2">
                    {revisions.map(revision => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <span>Revision {revision.revision_number} · {revision.revision_kind}</span>
                      <span className="text-xs text-muted-foreground">{new Date(revision.created_at).toLocaleString()}</span>
                    </div>)}
                    {!revisions.length && <p className="text-sm text-muted-foreground">No saved revisions yet.</p>}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Choose a menu or create a new one.</div>
          )}
        </div>
      )}
    </div>
  );
}

