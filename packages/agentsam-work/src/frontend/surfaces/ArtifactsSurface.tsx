import {
  Archive, ArrowLeft, BarChart3, Box, Check, Copy, ExternalLink, FileArchive, FileAudio2,
  FileCode2, FileImage, FileText, FileVideo2, Folder, Grid2X2, List, MoreHorizontal, Palette, Pencil,
  Plus, Presentation, RotateCcw, Search, Shapes, SlidersHorizontal, Star, StickyNote, Table2, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  { id: "docs", label: "Docs", description: "Documents and writing", icon: FileText },
  { id: "slides", label: "Slides", description: "Presentations and stories", icon: Presentation },
  { id: "sheets", label: "Sheets", description: "Tables and calculations", icon: Table2 },
  { id: "design", label: "Design", description: "Layouts and visual systems", icon: Palette },
  { id: "data", label: "Data", description: "Dashboards and analysis", icon: BarChart3 },
  { id: "whiteboard", label: "Whiteboard", description: "Ideas and collaborative maps", icon: Shapes },
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
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
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

  useEffect(() => setFailedPreviews(new Set()), [artifacts]);
  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setSource(initialSource), [initialSource]);

  const sources = useMemo(
    () => [...new Set(artifacts.map((item) => item.source))].sort(),
    [artifacts],
  );
  const kinds = useMemo(
    () => [...new Set(artifacts.map((item) => item.kind))].sort(),
    [artifacts],
  );
  const visible = useMemo(() => artifacts
    .filter((item) => {
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
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "type") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }), [artifacts, query, source, kind, view, sortBy]);

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

  const tabs: Array<{ id: LibraryView; label: string }> = [
    { id: "all", label: "All" },
    { id: "yours", label: "Yours" },
    { id: "shared", label: "Shared" },
  ];

  return (
    <div className="agentsam-artifact-hub" data-testid="artifacts-library">
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
                  </button>
                </label>
              ) : <span className="agentsam-artifact-hub__toolbar-spacer" />}

              <button type="button" className="agentsam-artifact-hub__icon-button" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
                <Search size={17} />
              </button>

              <details className="agentsam-artifact-hub__menu">
                <summary aria-label="Filter artifacts" title="Filter">
                  <SlidersHorizontal size={17} />
                </summary>
                <div className="agentsam-artifact-hub__menu-panel agentsam-artifact-hub__filter-panel">
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
                    {createOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button key={option.id} type="button" onClick={(event) => {
                          onCreateArtifact(option.id);
                          event.currentTarget.closest("details")?.removeAttribute("open");
                        }}>
                          <Icon size={15} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
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
                    const Icon = option.icon;
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
                          <Icon size={27} strokeWidth={1.55} aria-hidden="true" />
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
                <h2>{view === "shared" ? "Shared with you" : view === "yours" ? "Yours" : view === "trash" ? "Trash" : "Your artifacts"}</h2>
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
                  <strong>{query ? "No matching artifacts" : view === "shared" ? "Nothing shared with you yet" : view === "trash" ? "Trash is empty" : "Nothing here yet"}</strong>
                  <span>{query ? "Try another search or clear a filter." : view === "shared" ? "Artifacts shared with your account will appear here." : artifacts.length ? "Change the filters to see other saved work." : emptyMessage}</span>
                </div>
              ) : (
                <div className={"agentsam-artifact-hub__items is-" + layout}>
                  {visible.map((artifact) => {
                    const Icon = iconFor(artifact.kind);
                    const ownerEditable = artifact.resourceType === "artifact" && Boolean(artifact.providerId);
                    const hasDestination = Boolean(artifact.open || artifact.preview || (artifact.source === "local" && onOpenArtifact));
                    const isRenaming = renaming === artifact.id;
                    const isBusy = mutating === artifact.id;
                    const visual = Boolean(artifact.preview && !failedPreviews.has(artifact.id) && (["image", "video", "design", "website", "product", "document"].includes(artifact.kind) || artifact.mime === "application/pdf"));
                    return (
                      <article key={artifact.id} className="agentsam-artifact-hub__item" data-kind={artifact.kind} data-preview={visual ? "image" : "symbol"} data-busy={isBusy || undefined}>
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
                              {artifact.sourceLabel || sourceLabels[artifact.source]}
                              {artifact.updatedLabel ? " · " + artifact.updatedLabel : ""}
                              {artifact.sizeLabel ? " · " + artifact.sizeLabel : ""}
                            </div>
                          </div>
                          {artifact.starred ? <Star className="agentsam-artifact-hub__star" size={13} fill="currentColor" /> : null}
                          {hasDestination || ownerEditable ? (
                            <details className="agentsam-artifact-hub__item-menu">
                              <summary aria-label={artifact.name + " options"}><MoreHorizontal size={17} /></summary>
                              <div className="agentsam-artifact-hub__menu-panel">
                                {hasDestination ? <button type="button" onClick={() => openArtifact(artifact)}><ExternalLink size={14} /> Open</button> : null}
                                {artifact.open ? <button type="button" onClick={() => { void navigator.clipboard.writeText(new URL(artifact.open!, window.location.href).href); }}><Copy size={14} /> Copy link</button> : null}
                                {ownerEditable ? (
                                  <>
                                    <button type="button" disabled={isBusy} onClick={() => { setRenaming(artifact.id); setNewName(artifact.name); }}><Pencil size={14} /> Rename</button>
                                    <button type="button" disabled={isBusy} onClick={() => void assetMutation(artifact, { starred: !artifact.starred })}><Star size={14} /> {artifact.starred ? "Remove favorite" : "Favorite"}</button>
                                    <button type="button" disabled={isBusy} onClick={() => void assetMutation(artifact, { archived: !artifact.deleted })}>
                                      {artifact.deleted ? <RotateCcw size={14} /> : <Archive size={14} />}
                                      {artifact.deleted ? "Restore" : "Move to trash"}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
