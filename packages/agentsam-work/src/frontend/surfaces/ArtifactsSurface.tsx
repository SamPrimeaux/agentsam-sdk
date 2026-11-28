import {
  Archive, ArrowLeft, Box, Check, Copy, ExternalLink, FileArchive, FileAudio2,
  FileCode2, FileImage, FileText, FileVideo2, Folder, Grid2X2, List, MoreHorizontal, Palette, Pencil, Pin, Link, Share2, Trash2,
  Plus, Presentation, RotateCcw, Search, SlidersHorizontal, Star, StickyNote, Table2, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { CREATIVE_WIDGET_COVERS } from "@inneranimalmedia/agentsam-workbench/creative-covers";
import type { WorkArtifact, WorkArtifactCreateKind } from "../../contracts/index";

const sourceLabels: Record<WorkArtifact["source"], string> = {
  artifacts: "Saved work",
  r2: "R2",
  cf_images: "Cloudflare Images",
  stream: "Cloudflare Stream",
  "google-drive": "Google Drive",
  "shared-drives": "Shared drives",
  local: "My computer",
};

const createOptions = [
  { id: "docs", label: "Docs", description: "Documents and writing", cover: CREATIVE_WIDGET_COVERS.docs },
  { id: "slides", label: "Slides", description: "Presentations and stories", cover: CREATIVE_WIDGET_COVERS.slides },
  { id: "sheets", label: "Sheets", description: "Tables and calculations", cover: CREATIVE_WIDGET_COVERS.sheets },
  { id: "design", label: "Design", description: "Layouts and visual systems", cover: CREATIVE_WIDGET_COVERS.design },
  { id: "data", label: "Data", description: "Dashboards and analysis", cover: CREATIVE_WIDGET_COVERS.data },
  { id: "whiteboard", label: "Whiteboard", description: "Ideas and collaborative maps", cover: CREATIVE_WIDGET_COVERS.whiteboard },
] as const;

function iconFor(kind: WorkArtifact["kind"]) {
  switch (kind) {
    case "image": return FileImage;
    case "video": return FileVideo2;
    case "audio": return FileAudio2;
    case "model": return Box;
    case "code": return FileCode2;
    case "archive": return FileArchive;
    case "design":
    case "website":
    case "product": return Palette;
    case "presentation": return Presentation;
    case "spreadsheet": return Table2;
    case "note": return StickyNote;
    case "folder": return Folder;
    default: return FileText;
  }
}

type LibraryView = "all" | "yours" | "shared" | "recent" | "starred" | "trash";
type LibrarySort = "updated" | "name" | "type";
const ARTIFACT_PAGE_SIZE = 60;

export function ArtifactsSurface({
  artifacts,
  title = "Artifacts",
  initialSource = "all",
  initialView = "all",
  onOpenArtifact,
  onCreateArtifact,
  onRefresh,
  showCreateSection = true,
  openInWorkspace = false,
  emptyMessage = "No saved work is registered yet.",
}: {
  artifacts: WorkArtifact[];
  title?: string;
  initialSource?: WorkArtifact["source"] | "all";
  initialView?: LibraryView;
  emptyMessage?: string;
  onOpenArtifact?: (artifact: WorkArtifact) => void | Promise<void>;
  onCreateArtifact?: (kind: WorkArtifactCreateKind) => void;
  onRefresh?: () => void | Promise<void>;
  showCreateSection?: boolean;
  /** Route opened resources through the host's focused Side Stage workspace. */
  openInWorkspace?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">(() => {
    try { return sessionStorage.getItem("agentsam.artifacts.layout") === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("agentsam.artifacts.layout", layout); } catch { /* storage unavailable */ }
  }, [layout]);
  const [visibleLimit, setVisibleLimit] = useState(ARTIFACT_PAGE_SIZE);
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedArtifact = artifacts.find((artifact) => artifact.id === focusedId);
  const [source, setSource] = useState<WorkArtifact["source"] | "all">(initialSource);
  const [kind, setKind] = useState<WorkArtifact["kind"] | "all">("all");
  const [view, setView] = useState<LibraryView>(initialView);
  const [sortBy, setSortBy] = useState<LibrarySort>("updated");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mutating, setMutating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionMenu, setActionMenu] = useState<{ id: string; x: number; y: number; touch: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkArtifact | null>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null);
  const consumed = useRef(false);
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current.timer); }, []);
  useEffect(() => {
    const dialog = menuRef.current;
    if (actionMenu && dialog && !dialog.open) dialog.showModal();
    if (!actionMenu && dialog?.open) dialog.close();
  }, [actionMenu]);
  useEffect(() => {
    const dialog = deleteRef.current;
    if (deleteTarget && dialog && !dialog.open) dialog.showModal();
    if (!deleteTarget && dialog?.open) dialog.close();
  }, [deleteTarget]);
  const openActions = (id: string, x: number, y: number, touch: boolean) => {
    setNotice("");
    setActionMenu({ id, x, y, touch });
  };
  const beginHold = (event: PointerEvent<HTMLElement>, artifact: WorkArtifact, available: boolean) => {
    consumed.current = false;
    cancelHold();
    if (!available || event.pointerType !== "touch" || !event.isPrimary || (event.target as HTMLElement).closest("input,form,[data-artifact-actions]")) return;
    const { clientX: x, clientY: y, pointerId } = event;
    const timer = setTimeout(() => {
      hold.current = null;
      consumed.current = true;
      try { navigator.vibrate?.(12); } catch { /* Unsupported platforms retain visual feedback. */ }
      openActions(artifact.id, x, y, true);
    }, 480);
    hold.current = { timer, x, y, pointerId };
  };
  const moveHold = (event: PointerEvent<HTMLElement>) => {
    const active = hold.current;
    if (active && (event.pointerId !== active.pointerId || Math.hypot(event.clientX-active.x,event.clientY-active.y)>10)) cancelHold();
  };


  useEffect(() => setFailedPreviews(new Set()), [artifacts]);
  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setSource(initialSource), [initialSource]);
  useEffect(() => setVisibleLimit(ARTIFACT_PAGE_SIZE), [query, source, kind, view, sortBy]);

  const sources = useMemo(
    () => [...new Set(artifacts.map((item) => item.source))].sort(),
    [artifacts],
  );
  const kinds = useMemo(
    () => [...new Set(artifacts.map((item) => item.kind))].sort(),
    [artifacts],
  );
  const visible = useMemo(() => {
    const matching = artifacts.filter((item) => {
      const matchesView =
        view === "all" ||
        view === "recent" ||
        view === "trash" ||
        (view === "starred" && item.starred === true) ||
        (view === "shared" && item.shared === true) ||
        (view === "yours" && item.shared !== true);
      return item.name.toLowerCase().includes(query.toLowerCase()) &&
        (source === "all" || item.source === source) &&
        (kind === "all" || item.kind === kind) &&
        (view === "trash" ? item.deleted : !item.deleted) &&
        matchesView;
    });
    const sorted = matching.sort((a, b) => {
      if (view === "all") { const pinned = Number(!!b.starred) - Number(!!a.starred); if (pinned) return pinned; }
      if (view === "recent") return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "type") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return view === "recent" ? sorted.slice(0, 50) : sorted;
  }, [artifacts, query, source, kind, view, sortBy]);

  const displayedArtifacts = visible.slice(0, visibleLimit);

  const assetMutation = async (
    artifact: WorkArtifact,
    patch: { name?: string; starred?: boolean; archived?: boolean },
  ) => {
    if (artifact.resourceType !== "artifact" || !artifact.providerId) return;
    setMutating(artifact.id);
    setError("");
    try {
      const response = await fetch("/api/work/library/artifacts/" + encodeURIComponent(artifact.providerId), {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("We couldn't save that change. Please try again.");
      await onRefresh?.();
      setRenaming(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't finish that. Please try again.");
    } finally {
      setMutating(null);
    }
  };

  const openArtifact = (artifact: WorkArtifact) => {
    if (openInWorkspace && onOpenArtifact) {
      void onOpenArtifact(artifact);
      return;
    }
    if (artifact.open) {
      try {
        const destination = new URL(artifact.open, window.location.href);
        if (!["http:", "https:"].includes(destination.protocol)) return;
        if (destination.origin === window.location.origin) window.location.assign(destination.href);
        else window.open(destination.href, "_blank", "noopener,noreferrer");
      } catch { /* A malformed destination must not navigate. */ }
      return;
    }
    if (artifact.source === "local" && onOpenArtifact) {
      void onOpenArtifact(artifact);
      return;
    }
    if (artifact.preview) {
      try {
        const destination = new URL(artifact.preview, window.location.href);
        if (!["http:", "https:"].includes(destination.protocol)) return;
        if (destination.origin === window.location.origin) window.location.assign(destination.href);
        else window.open(destination.href, "_blank", "noopener,noreferrer");
      } catch { /* Preview unavailable. */ }
    }
  };

  const openOrPreview = (artifact: WorkArtifact, hasDestination: boolean) => {
    if (openInWorkspace && hasDestination) openArtifact(artifact);
    else setFocusedId(artifact.id);
  };


  const menuArtifact = artifacts.find(item => item.id === actionMenu?.id);
  const canEdit = (item: WorkArtifact) => item.resourceType === "artifact" && !!item.providerId;
  const canDuplicate = (item: WorkArtifact) => canEdit(item) && item.artifactType === "design-canvas" && !item.deleted;
  const artifactLink = (item: WorkArtifact) => {
    if (!item.open) return null;
    try { const url = new URL(item.open, window.location.href); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
  };
  const copyLink = async (item: WorkArtifact) => {
    const url = artifactLink(item);
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setNotice("Link copied. Access permissions are unchanged."); }
    catch { setError("Couldn't copy the link. Please try again."); }
  };
  const shareLink = async (item: WorkArtifact) => {
    const url = artifactLink(item);
    if (!url) return;
    if (!navigator.share) { await copyLink(item); return; }
    try { await navigator.share({ title: item.name, url }); }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Couldn't share that link."); }
  };
  const duplicate = async (item: WorkArtifact) => {
    if (!canDuplicate(item)) return;
    setMutating(item.id); setError(""); setNotice("");
    try {
      const endpoint = "/api/work/canvases";
      const read = await fetch(endpoint + "/" + encodeURIComponent(item.providerId!), { credentials: "same-origin" });
      if (!read.ok) throw new Error("Couldn't load the original artifact.");
      const result = await read.json();
      if (!result.document || !result.ok) throw new Error("The original artifact isn't available.");
      const id = "canvas_" + crypto.randomUUID();
      const document = structuredClone(result.document);
      const name = (item.name + " copy").slice(0,160);
      document.name = name;
      if (document.creativeWorkspace?.artifact) {
        Object.assign(document.creativeWorkspace.artifact, { id, name, pinned: false, shared: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, document }) });
      if (!response.ok || !(await response.json()).ok) throw new Error("Couldn't duplicate the artifact.");
      await onRefresh?.(); setNotice("Private copy created.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't duplicate the artifact."); }
    finally { setMutating(null); }
  };
  const act = (fn: () => void) => { setActionMenu(null); fn(); };

  const tabs: Array<{ id: LibraryView; label: string }> = [
    { id: "all", label: "All" },
    { id: "yours", label: "Yours" },
    { id: "shared", label: "Shared" },
  ];

  return (
    <div className="agentsam-artifact-hub" data-testid="artifacts-library">
      {notice ? <div className="agentsam-artifact-hub__action-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={16}/></button></div> : null}
      <dialog ref={menuRef} className="agentsam-artifact-hub__actions" data-touch={actionMenu?.touch || undefined} aria-label={menuArtifact ? menuArtifact.name + " actions" : "Artifact actions"} onCancel={() => setActionMenu(null)} onClick={event => { if (event.target === event.currentTarget) setActionMenu(null); }}
        style={actionMenu && !actionMenu.touch ? { left: Math.max(12, Math.min(actionMenu.x - 244, window.innerWidth - 256)), top: Math.max(12, Math.min(actionMenu.y + 4, window.innerHeight - 350)) } : undefined}>
        {menuArtifact ? <div className="agentsam-artifact-hub__action-content">
          {canEdit(menuArtifact) && !menuArtifact.deleted ? <>
            <button type="button" onClick={() => act(() => void assetMutation(menuArtifact, { starred: !menuArtifact.starred }))}><Pin size={19}/>{menuArtifact.starred ? "Unpin" : "Pin"}</button>
            <hr/>
            <button type="button" onClick={() => act(() => { setRenaming(menuArtifact.id); setNewName(menuArtifact.name); })}><Pencil size={19}/>Rename</button>
          </> : null}
          <button type="button" disabled={!canDuplicate(menuArtifact)} title={canDuplicate(menuArtifact) ? undefined : "Duplication is unavailable for this artifact type"} onClick={() => act(() => void duplicate(menuArtifact))}><Copy size={19}/>Duplicate</button>
          <button type="button" disabled={!artifactLink(menuArtifact)} onClick={() => act(() => void copyLink(menuArtifact))}><Link size={19}/>Copy link</button>
          <button type="button" disabled={!artifactLink(menuArtifact)} onClick={() => act(() => void shareLink(menuArtifact))}><Share2 size={19}/>Share</button>
          {canEdit(menuArtifact) ? <><hr/><button type="button" data-destructive={!menuArtifact.deleted || undefined} onClick={() => act(() => menuArtifact.deleted ? void assetMutation(menuArtifact, { archived: false }) : setDeleteTarget(menuArtifact))}>{menuArtifact.deleted ? <RotateCcw size={19}/> : <Trash2 size={19}/>}{menuArtifact.deleted ? "Restore" : "Delete"}</button></> : null}
        </div> : null}
      </dialog>
      <dialog ref={deleteRef} className="agentsam-artifact-hub__actions" data-touch="true" aria-label="Delete artifact" onCancel={() => setDeleteTarget(null)} onClick={event => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
        {deleteTarget ? <div className="agentsam-artifact-hub__action-content"><strong>Delete {deleteTarget.name}?</strong><p>This moves the artifact to Trash. You can restore it later.</p><button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" data-destructive="true" onClick={() => { const item = deleteTarget; setDeleteTarget(null); void assetMutation(item, { archived: true }); }}>Move to Trash</button></div> : null}
      </dialog>
      {focusedArtifact ? (
        <section className="agentsam-artifact-hub__focused" aria-label={"Viewing " + focusedArtifact.name}>
          <header className="agentsam-artifact-hub__focused-header">
            <button type="button" className="agentsam-artifact-hub__back" onClick={() => setFocusedId(null)}>
              <ArrowLeft size={17} aria-hidden="true" /> Artifacts
            </button>
            <div className="agentsam-artifact-hub__focused-title">
              <strong>{focusedArtifact.name}</strong>
              <span>{focusedArtifact.sourceLabel || sourceLabels[focusedArtifact.source]}{focusedArtifact.updatedLabel ? " · " + focusedArtifact.updatedLabel : ""}</span>
            </div>
            {focusedArtifact.open || (focusedArtifact.source === "local" && onOpenArtifact) ? (
              <button type="button" className="agentsam-artifact-hub__quiet-action" onClick={() => openArtifact(focusedArtifact)}>
                <ExternalLink size={15} aria-hidden="true" /> Open original
              </button>
            ) : null}
          </header>
          <div className="agentsam-artifact-hub__focused-stage">
            {focusedArtifact.mime?.startsWith("video/") && focusedArtifact.open ? (
              <video controls preload="metadata" poster={focusedArtifact.preview || undefined} src={focusedArtifact.open} aria-label={focusedArtifact.name} />
            ) : focusedArtifact.mime === "application/pdf" && (focusedArtifact.open || focusedArtifact.preview) ? (
              <iframe title={focusedArtifact.name} src={focusedArtifact.open || focusedArtifact.preview || undefined} sandbox="allow-same-origin" referrerPolicy="no-referrer" />
            ) : (focusedArtifact.preview || (focusedArtifact.kind === "image" && focusedArtifact.open)) && !failedPreviews.has(focusedArtifact.id) ? (
              <img
                src={(focusedArtifact.kind === "image" ? focusedArtifact.open || focusedArtifact.preview : focusedArtifact.preview) || undefined}
                alt={focusedArtifact.name}
                onError={() => setFailedPreviews((previous) => new Set(previous).add(focusedArtifact.id))}
              />
            ) : (
              <div className="agentsam-artifact-hub__unavailable">
                <FileText size={34} strokeWidth={1.4} aria-hidden="true" />
                <strong>No preview available</strong>
                <span>The original remains in its connected Library source.</span>
              </div>
            )}
          </div>
          <footer className="agentsam-artifact-hub__focused-meta">
            <span>{focusedArtifact.kind}</span>
            {focusedArtifact.sizeLabel ? <span>{focusedArtifact.sizeLabel}</span> : null}
          </footer>
        </section>
      ) : (
        <div className="agentsam-artifact-hub__scroll">
          <div className="agentsam-artifact-hub__content">
            <header className="agentsam-artifact-hub__header">
              <div>
                <h1>{title}</h1>
                <p>Your documents, designs, data, and saved work.</p>
              </div>
            </header>

            <nav className="agentsam-artifact-hub__tabs" aria-label="Artifact ownership">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-active={view === tab.id}
                  aria-pressed={view === tab.id}
                  onClick={() => setView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="agentsam-artifact-hub__toolbar">
              {searchOpen ? (
                <label className="agentsam-artifact-hub__search-field">
                  <Search size={15} aria-hidden="true" />
                  <input
                    autoFocus
                    aria-label="Search artifacts"
                    placeholder="Search artifacts"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <button type="button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(""); }}>
                    <X size={15} />
                    <span className="agentsam-artifact-hub__icon-tooltip">Close search</span>
                  </button>
                </label>
              ) : <span className="agentsam-artifact-hub__toolbar-spacer" />}

              <button type="button" className="agentsam-artifact-hub__icon-button" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
                <Search size={17} />
                <span className="agentsam-artifact-hub__icon-tooltip">Search</span>
              </button>

              <details className="agentsam-artifact-hub__menu">
                <summary aria-label="Filter artifacts" title="Filter">
                  <SlidersHorizontal size={17} />
                </summary>
                <div className="agentsam-artifact-hub__menu-panel agentsam-artifact-hub__filter-panel">
                  <label>
                    Layout
                    <select aria-label="Artifact layout" value={layout} onChange={(event) => setLayout(event.target.value === "list" ? "list" : "grid")}>
                      <option value="grid">Grid</option>
                      <option value="list">List</option>
                    </select>
                  </label>
                  <label>
                    View
                    <select aria-label="Filter by view" value={view} onChange={(event) => setView(event.target.value as LibraryView)}>
                      <option value="all">All artifacts</option>
                      <option value="yours">Yours</option>
                      <option value="shared">Shared</option>
                      <option value="recent">Recent</option>
                      <option value="starred">Pinned</option>
                      <option value="trash">Trash</option>
                    </select>
                  </label>
                  <label>
                    Type
                    <select aria-label="Filter by type" value={kind} onChange={(event) => setKind(event.target.value as WorkArtifact["kind"] | "all")}>
                      <option value="all">Any type</option>
                      {kinds.map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
                    </select>
                  </label>
                  <label>
                    Source
                    <select aria-label="Filter by source" value={source} onChange={(event) => setSource(event.target.value as WorkArtifact["source"] | "all")}>
                      <option value="all">Any source</option>
                      {sources.map((value) => <option key={value} value={value}>{sourceLabels[value]}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => { setKind("all"); setSource("all"); setView("all"); }}>
                    <X size={13} /> Clear filters
                  </button>
                </div>
              </details>

              <details className="agentsam-artifact-hub__menu">
                <summary aria-label="Sort artifacts" title="Sort">
                  <List size={17} />
                </summary>
                <div className="agentsam-artifact-hub__menu-panel">
                  <span className="agentsam-artifact-hub__menu-label">Sort by</span>
                  {([
                    { id: "updated", label: "Recently updated" },
                    { id: "name", label: "Name" },
                    { id: "type", label: "Type" },
                  ] as const).map((option) => (
                    <button key={option.id} type="button" data-selected={sortBy === option.id} onClick={() => setSortBy(option.id)}>
                      {option.label}{sortBy === option.id ? <Check size={14} /> : null}
                    </button>
                  ))}
                </div>
              </details>

              <button
                type="button"
                className="agentsam-artifact-hub__icon-button"
                aria-label={layout === "grid" ? "Switch to list view" : "Switch to grid view"}
                title={layout === "grid" ? "List view" : "Grid view"}
                onClick={() => setLayout((current) => current === "grid" ? "list" : "grid")}
              >
                {layout === "grid" ? <List size={17} /> : <Grid2X2 size={17} />}
              </button>

              {onCreateArtifact ? (
                <details className="agentsam-artifact-hub__menu">
                  <summary className="agentsam-artifact-hub__add-button" aria-label="Create artifact" title="Create artifact">
                    <Plus size={18} />
                  </summary>
                  <div className="agentsam-artifact-hub__menu-panel agentsam-artifact-hub__create-menu">
                    <span className="agentsam-artifact-hub__menu-label">Create new</span>
                    {createOptions.map((option) => (
                      <button key={option.id} type="button" onClick={(event) => {
                        onCreateArtifact(option.id);
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }}>
                        <img src={option.cover} alt="" aria-hidden="true" draggable={false} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>

            {showCreateSection ? (
              <section className="agentsam-artifact-hub__create-section" aria-labelledby="agentsam-artifact-create-heading">
                <div className="agentsam-artifact-hub__section-heading">
                  <h2 id="agentsam-artifact-create-heading">Make something new</h2>
                </div>
                <div className="agentsam-artifact-hub__create-grid">
                  {createOptions.map((option) => {
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="agentsam-artifact-hub__create-card"
                        data-kind={option.id}
                        title={option.description}
                        disabled={!onCreateArtifact}
                        onClick={() => onCreateArtifact?.(option.id)}
                      >
                        <span className="agentsam-artifact-hub__create-art">
                          <img
                            src={option.cover}
                            alt=""
                            aria-hidden="true"
                            loading="eager"
                            decoding="async"
                            draggable={false}
                          />
                        </span>
                        <span className="agentsam-artifact-hub__create-label">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="agentsam-artifact-hub__saved" aria-label="Saved artifacts">
              <div className="agentsam-artifact-hub__section-heading">
                <h2>{view === "shared" ? "Shared with you" : view === "yours" ? "Yours" : view === "recent" ? "Recently updated" : view === "starred" ? "Pinned" : view === "trash" ? "Trash" : "Your artifacts"}</h2>
                <span>{visible.length} {visible.length === 1 ? "item" : "items"}</span>
              </div>

              {error ? (
                <div role="alert" className="agentsam-artifact-hub__error">
                  <span>{error}</span>
                  <button type="button" onClick={() => setError("")}>Dismiss</button>
                </div>
              ) : null}

              {!visible.length ? (
                <div className="agentsam-artifact-hub__empty">
                  <Folder size={24} strokeWidth={1.35} aria-hidden="true" />
                  <strong>{query ? "No matching artifacts" : view === "shared" ? "Nothing shared with you yet" : view === "recent" ? "No recent updates" : view === "starred" ? "Nothing pinned yet" : view === "trash" ? "Trash is empty" : "Nothing here yet"}</strong>
                  <span>{query ? "Try another search or clear a filter." : view === "shared" ? "Artifacts shared with your account will appear here." : view === "recent" ? "Your 50 most recently updated items will appear here." : view === "starred" ? "Pin an artifact to keep it close." : view === "trash" ? "Deleted artifacts can be restored here." : artifacts.length ? "Change the filters to see other saved work." : emptyMessage}</span>
                </div>
              ) : (
                <div className={"agentsam-artifact-hub__items is-" + layout}>
                  {displayedArtifacts.map((artifact) => {
                    const Icon = iconFor(artifact.kind);
                    const ownerEditable = artifact.resourceType === "artifact" && Boolean(artifact.providerId);
                    const hasDestination = Boolean(artifact.open || artifact.preview || (artifact.source === "local" && onOpenArtifact));
                    const isRenaming = renaming === artifact.id;
                    const isBusy = mutating === artifact.id;
                    const visual = Boolean(artifact.preview && !failedPreviews.has(artifact.id) && (["image", "video", "design", "website", "product", "document", "presentation"].includes(artifact.kind) || artifact.mime === "application/pdf"));
                    return (
                      <article key={artifact.id} className="agentsam-artifact-hub__item" data-kind={artifact.kind} data-preview={visual ? "image" : "symbol"} data-busy={isBusy || undefined} data-menu-active={actionMenu?.id === artifact.id || undefined}
                        onPointerDown={event => beginHold(event, artifact, hasDestination || ownerEditable)}
                        onPointerMove={moveHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
                        onClickCapture={event => { if (consumed.current) { event.preventDefault(); event.stopPropagation(); consumed.current = false; } }}
                        onContextMenu={event => { if (!hasDestination && !ownerEditable) return; event.preventDefault(); cancelHold(); openActions(artifact.id, event.clientX, event.clientY, matchMedia("(pointer: coarse)").matches); }}>
                        <button type="button" className="agentsam-artifact-hub__preview" aria-label={"Open " + artifact.name} onClick={() => openOrPreview(artifact, hasDestination)}>
                          {visual && artifact.preview ? (
                            artifact.mime === "application/pdf" ? (
                              <iframe title={artifact.name + " preview"} src={artifact.preview + "#toolbar=0&navpanes=0"} loading="lazy" tabIndex={-1} />
                            ) : (
                              <img src={artifact.preview} alt="" loading="lazy" decoding="async" onError={() => setFailedPreviews((previous) => new Set(previous).add(artifact.id))} />
                            )
                          ) : (
                            <div className="agentsam-artifact-hub__symbol">
                              <Icon size={34} strokeWidth={1.35} />
                              <span>{artifact.kind === "design" ? "Design" : artifact.kind === "model" ? "3D model" : artifact.kind === "note" ? "Note" : artifact.kind === "spreadsheet" ? "Spreadsheet" : artifact.kind === "presentation" ? "Presentation" : artifact.kind === "folder" ? "Folder" : artifact.kind === "document" ? "Document" : artifact.kind === "code" ? "Code" : artifact.kind.charAt(0).toUpperCase() + artifact.kind.slice(1)}</span>
                            </div>
                          )}
                        </button>

                        <div className="agentsam-artifact-hub__item-footer">
                          <Icon size={15} className="agentsam-artifact-hub__type-icon" strokeWidth={1.5} />
                          <div className="agentsam-artifact-hub__item-details">
                            {isRenaming ? (
                              <form className="agentsam-artifact-hub__rename" onSubmit={(event) => {
                                event.preventDefault();
                                if (newName.trim()) void assetMutation(artifact, { name: newName.trim() });
                              }}>
                                <input autoFocus aria-label="Rename artifact" value={newName} maxLength={160} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} />
                                <button type="submit" disabled={!newName.trim() || isBusy}>Save</button>
                              </form>
                            ) : (
                              <button type="button" title={artifact.name} className="agentsam-artifact-hub__item-name" onClick={() => openOrPreview(artifact, hasDestination)}>
                                {artifact.name}
                              </button>
                            )}
                            <div className="agentsam-artifact-hub__item-meta">
                              {layout === "grid" ? (artifact.kind === "presentation" ? "Slides" : artifact.kind.charAt(0).toUpperCase() + artifact.kind.slice(1)) : artifact.shared === true ? "Shared" : artifact.shared === false ? "Not shared" : artifact.sourceLabel || sourceLabels[artifact.source]}
                              {layout === "list" && artifact.updatedLabel ? <span className="agentsam-artifact-hub__edited">{artifact.updatedLabel}</span> : null}
                            </div>
                          </div>
                          {artifact.starred ? <Pin className="agentsam-artifact-hub__star" size={13} fill="currentColor" /> : null}
                          {hasDestination || ownerEditable ? (
                            <button type="button" data-artifact-actions className="agentsam-artifact-hub__action-trigger" aria-label={artifact.name + " options"} aria-haspopup="dialog" aria-expanded={actionMenu?.id === artifact.id} onClick={event => { const r = event.currentTarget.getBoundingClientRect(); openActions(artifact.id, r.right, r.bottom, matchMedia("(pointer: coarse)").matches); }}><MoreHorizontal size={19}/></button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {visible.length > visibleLimit ? (
                <div className="agentsam-artifact-hub__pagination" role="group" aria-label="More artifacts">
                  <span>Showing {displayedArtifacts.length} of {visible.length}</span>
                  <button type="button" onClick={() => setVisibleLimit((limit) => Math.min(limit + ARTIFACT_PAGE_SIZE, visible.length))}>
                    Show {Math.min(ARTIFACT_PAGE_SIZE, visible.length - visibleLimit)} more
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
