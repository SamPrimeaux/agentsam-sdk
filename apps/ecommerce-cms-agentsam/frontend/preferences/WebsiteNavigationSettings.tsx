import { useEffect, useMemo, useState } from "react";
import { createHttpCmsAdapter } from "../../cms-editor/frontend/src/adapters/http";

function Glyph({ symbol }: { symbol: string }) { return <span className="sp-menu-glyph" aria-hidden="true">{symbol}</span>; }

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
  return { id: "nav-" + crypto.randomUUID(), label: "New link", href: "/" };
}

/** The merchant Preferences page owns site selection; this editor owns CMS menus only. */
export function WebsiteNavigationSettings({ siteId, onActivity }: { siteId: string; onActivity: (dirty: boolean, saving: boolean) => void }) {
  const cmsAdapter = useMemo(() => createHttpCmsAdapter(), []);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [draft, setDraft] = useState<Menu | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [loadedMenus, setLoadedMenus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { onActivity(dirty, saving); }, [dirty, saving, onActivity]);

  const selectedMenu = useMemo(() => menus.find(menu => menu.id === selectedMenuId) || null, [menus, selectedMenuId]);

  const loadMenus = async (selectedSiteId: string) => {
    if (!selectedSiteId) return;
    setLoadingMenus(true);
    setLoadedMenus(false);
    setError("");
    try {
      const available = (await cmsAdapter.listNavigationMenus(selectedSiteId)).map(fromCmsMenu);
      setMenus(available);
      setLoadedMenus(true);
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
    if (!draft || !siteId || saving || !dirty || draft.read_only) return;
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
      setNotice(saved.status === "active" ? "Menu published." : "Menu saved as " + saved.status + ".");
      if (historyOpen) await loadHistory(saved.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this menu");
    } finally {
      setSaving(false);
    }
  };

  const createMenu = async () => {
    if (!siteId || saving || !loadedMenus) return;
    if (dirty && !window.confirm("Discard unsaved menu changes and create a new menu?")) return;
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
    if (!draft || !selectedMenu || saving || draft.read_only) return;
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

  return (
    <div className="sp-menu-editor">
      <div className="sp-menu-toolbar">
        <div><strong>Navigation menus</strong><p>Create and edit menus for the selected website.</p></div>
        <button type="button" onClick={createMenu} disabled={saving || loadingMenus || !loadedMenus} className="sp-menu-button"><Glyph symbol="+" /> New menu</button>
      </div>
      {error && <div role="alert" className="sp-menu-error">
        {error === "cms_navigation_schema_upgrade_required" ? "The CMS navigation database needs its existing schema upgrade before menus can be edited." : error}
        {!loadedMenus && <button type="button" className="sp-menu-button" onClick={() => void loadMenus(siteId)} disabled={loadingMenus}>Retry</button>}
      </div>}
      {notice && <div role="status" className="sp-menu-notice">{notice}</div>}

      {loadingMenus ? (
        <div className="sp-menu-panel sp-menu-muted">Loading menus…</div>
      ) : !loadedMenus ? null : !menus.length ? (
        <div className="sp-menu-panel">
          <h3 className="sp-menu-heading">No navigation menus yet</h3>
          <p className="sp-menu-muted">Create a menu here. Website headers and footers read their published menus from the CMS navigation table.</p>
          <button type="button" onClick={createMenu} className="sp-menu-button sp-menu-primary"><Glyph symbol="+" /> Create menu</button>
        </div>
      ) : (
        <div className="sp-menu-layout">
          <aside className="sp-menu-list">
            <div className="sp-menu-list-title">Menus</div>
            <div className="sp-menu-choices">
              {menus.map(menu => (
                <button key={menu.id} type="button" onClick={() => selectMenu(menu.id)} className={"sp-menu-choice " + (selectedMenuId === menu.id ? "is-active" : "")}>
                  <span className="sp-menu-truncate">{menu.title}</span>
                  <span className="sp-menu-status">{menu.status}</span>
                </button>
              ))}
            </div>
          </aside>

          {draft && selectedMenu ? (
            <section className="sp-menu-panel">
              <div className="sp-menu-form-head">
                <div className="sp-menu-fields">
                  <label className="sp-menu-field">Menu title
                    <input value={draft.title} onChange={event => updateDraft({ title: event.target.value })} maxLength={120} className="sp-menu-input" />
                  </label>
                  <label className="sp-menu-field">Handle
                    <input value={draft.handle} onChange={event => updateDraft({ handle: event.target.value })} maxLength={64} className="sp-menu-input" />
                  </label>
                  <label className="sp-menu-field">Format
                    <select value={draft.layout} onChange={event => updateDraft({ layout: event.target.value as Menu["layout"] })} className="sp-menu-input">
                      <option value="links">Link list</option>
                      <option value="grouped-footer">Grouped footer</option>
                    </select>
                  </label>
                  <label className="sp-menu-field">Status
                    <select value={draft.status} onChange={event => updateDraft({ status: event.target.value as Menu["status"] })} className="sp-menu-input">
                      <option value="draft">Draft</option>
                      <option value="active">Active / published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>
                <div className="sp-menu-actions">
                  <button type="button" onClick={toggleHistory} className="sp-menu-button"><Glyph symbol="↶" /> History</button>
                  <button type="button" onClick={save} disabled={!dirty || saving || draft.read_only} className="sp-menu-button sp-menu-primary"><Glyph symbol="✓" /> {saving ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={archiveMenu} disabled={saving || draft.status === "archived"} className="sp-menu-button"><Glyph symbol="×" /> Archive</button>
                </div>
              </div>

              {draft.read_only && <p className="sp-menu-warning">This menu contains an unrecognized legacy payload. It is preserved and cannot be overwritten until its format is mapped.</p>}

              {draft.layout === "links" ? (
                <div className="sp-menu-stack">
                  <div className="sp-menu-row">
                    <div><h3 className="sp-menu-heading">Menu links</h3><p className="sp-menu-muted">Links are saved in the site's CMS navigation record.</p></div>
                    <button type="button" onClick={() => updateDraft({ items: [...draft.items, newLink()] })} className="sp-menu-button"><Glyph symbol="+" /> Add link</button>
                  </div>
                  {draft.items.map((item, index) => (
                    <div key={item.id} className="sp-menu-link">
                      <label className="sp-menu-field">Label
                        <input value={item.label} onChange={event => updateItem(index, { label: event.target.value })} className="sp-menu-input" />
                      </label>
                      <label className="sp-menu-field">Destination
                        <input value={item.href} onChange={event => updateItem(index, { href: event.target.value })} placeholder="/about or https://example.com" className="sp-menu-input" />
                      </label>
                      <div className="sp-menu-row">
                        <button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label="Move link up" className="sp-menu-button sp-menu-icon"><Glyph symbol="↑" /></button>
                        <button type="button" disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)} aria-label="Move link down" className="sp-menu-button sp-menu-icon"><Glyph symbol="↓" /></button>
                        <button type="button" onClick={() => updateDraft({ items: draft.items.filter((_, itemIndex) => itemIndex !== index) })} aria-label="Remove link" className="sp-menu-button sp-menu-icon sp-menu-danger"><Glyph symbol="×" /></button>
                      </div>
                    </div>
                  ))}
                  {!draft.items.length && <p className="sp-menu-empty">This menu has no links yet.</p>}
                </div>
              ) : (
                <div className="sp-menu-stack">
                  <div className="sp-menu-row"><div><h3 className="sp-menu-heading">Footer groups</h3><p className="sp-menu-muted">Organize footer links under reusable group headings.</p></div>
                    <button type="button" onClick={() => updateDraft({ groups: [...draft.groups, { key: "group-" + crypto.randomUUID(), label: "New group", items: [] }] })} className="sp-menu-button"><Glyph symbol="+" /> Add group</button>
                  </div>
                  {draft.groups.map((group, groupIndex) => (
                    <div key={group.key} className="sp-menu-group">
                      <div className="sp-menu-row">
                        <label className="sp-menu-field sp-menu-grow">Group title
                          <input value={group.label} onChange={event => updateGroup(groupIndex, { label: event.target.value })} className="sp-menu-input" />
                        </label>
                        <button type="button" onClick={() => updateDraft({ groups: draft.groups.filter((_, index) => index !== groupIndex) })} aria-label="Remove group" className="sp-menu-button sp-menu-icon sp-menu-danger"><Glyph symbol="×" /></button>
                      </div>
                      {group.items.map((item, itemIndex) => (
                        <div key={item.id} className="sp-menu-link">
                          <label className="sp-menu-field">Label
                            <input value={item.label} onChange={event => updateGroupItem(groupIndex, itemIndex, { label: event.target.value })} className="sp-menu-input" />
                          </label>
                          <label className="sp-menu-field">Destination
                            <input value={item.href} onChange={event => updateGroupItem(groupIndex, itemIndex, { href: event.target.value })} className="sp-menu-input" />
                          </label>
                          <div className="sp-menu-row">
                            <button type="button" disabled={itemIndex === 0} onClick={() => moveGroupItem(groupIndex, itemIndex, -1)} aria-label="Move footer link up" className="sp-menu-button sp-menu-icon"><Glyph symbol="↑" /></button>
                            <button type="button" disabled={itemIndex === group.items.length - 1} onClick={() => moveGroupItem(groupIndex, itemIndex, 1)} aria-label="Move footer link down" className="sp-menu-button sp-menu-icon"><Glyph symbol="↓" /></button>
                            <button type="button" onClick={() => updateGroup(groupIndex, { items: group.items.filter((_, index) => index !== itemIndex) })} aria-label="Remove footer link" className="sp-menu-button sp-menu-icon sp-menu-danger"><Glyph symbol="×" /></button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => updateGroup(groupIndex, { items: [...group.items, newLink()] })} className="sp-menu-button"><Glyph symbol="+" /> Add link</button>
                    </div>
                  ))}
                  {!draft.groups.length && <p className="sp-menu-empty">No footer groups yet.</p>}
                </div>
              )}

              {historyOpen && (
                <div className="sp-menu-history">
                  <h3 className="sp-menu-heading">Revision history</h3>
                  <div className="sp-menu-stack">
                    {revisions.map(revision => <div key={revision.id} className="sp-menu-row">
                      <span>Revision {revision.revision_number} · {revision.revision_kind}</span>
                      <span className="sp-menu-muted">{new Date(revision.created_at).toLocaleString()}</span>
                    </div>)}
                    {!revisions.length && <p className="sp-menu-muted">No saved revisions yet.</p>}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div className="sp-menu-panel sp-menu-muted">Choose a menu or create a new one.</div>
          )}
        </div>
      )}
    </div>
  );
}

