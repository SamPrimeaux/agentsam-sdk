import { FileArchive, FileCode2, FileImage, FileText, Grid2X2, List } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkArtifact } from "../../contracts/index";
import { WorkSearch } from "../WorkShell";

function iconFor(kind: WorkArtifact["kind"]) {
  if (kind === "image") return FileImage;
  if (kind === "code") return FileCode2;
  if (kind === "archive") return FileArchive;
  return FileText;
}

export function ArtifactsSurface({ artifacts, title = "All sources", heading = "My artifacts",
  initialSource = "all", initialView = "all", onOpenArtifact,
  emptyMessage = "No files are registered for this view. Provider connections are not inferred from empty results.",
}: { artifacts: WorkArtifact[]; title?: string; heading?: string;
  initialSource?: WorkArtifact["source"] | "all";
  initialView?: "all" | "recent" | "starred" | "shared" | "trash";
  emptyMessage?: string;
  onOpenArtifact?: (artifact: WorkArtifact) => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(true);
  const [source, setSource] = useState<WorkArtifact["source"] | "all">(initialSource);
  useEffect(() => setSource(initialSource), [initialSource]);
  const [kind, setKind] = useState<WorkArtifact["kind"] | "all">("all");
  const [view, setView] = useState(initialView);
  useEffect(() => setView(initialView), [initialView]);
  // Show storage choices even before their adapter has supplied any data.
  // Empty != disconnected: connection health requires a separate verified provider read.
  const sources: WorkArtifact["source"][] = ["artifacts", "r2", "google-drive", "shared-drives", "local"];
  const kinds = [...new Set(artifacts.map((artifact) => artifact.kind))].sort();
  const visible = useMemo(
    () => artifacts.filter((artifact) =>
      artifact.name.toLowerCase().includes(query.toLowerCase()) &&
      (source === "all" || artifact.source === source) &&
      (kind === "all" || artifact.kind === kind) &&
      (view === "trash" ? artifact.deleted === true : artifact.deleted !== true) &&
      (view !== "starred" || artifact.starred === true) &&
      (view !== "shared" || artifact.shared === true)
    ).sort((a, b) => view === "recent" ? (b.updatedAt || 0) - (a.updatedAt || 0) : 0),
    [artifacts, query, source, kind, view],
  );
  const filtered = Boolean(query || source !== "all" || kind !== "all" || view !== "all");

  return (
    <div className="agentsam-work-artifacts">
      <div className="agentsam-work-artifacts__search">
        <WorkSearch value={query} onChange={setQuery} placeholder="Search files across sources" />
      </div>

      <div className="agentsam-work-artifacts__content">
        <div className="agentsam-work-artifacts__heading">
          <h1>{view !== "all" ? view === "shared" ? "Shared with me" : view.charAt(0).toUpperCase()+view.slice(1) : title}</h1>
          <div className="agentsam-work-artifacts__spacer" />
          <button type="button" className="agentsam-work-toolbar-button" data-primary={!grid} onClick={() => setGrid(false)} aria-label="List view">
            <List size={15} /><span>List</span>
          </button>
          <button type="button" className="agentsam-work-toolbar-button" data-primary={grid} onClick={() => setGrid(true)} aria-label="Grid view">
            <Grid2X2 size={15} /><span>Grid</span>
          </button>
        </div>

        <div className="agentsam-work-artifacts__filters">
          <span className="agentsam-work-toolbar-button" aria-live="polite">{visible.length} {visible.length === 1 ? "item" : "items"}</span>
          <label className="agentsam-work-toolbar-button">Source: <select aria-label="Filter by source" value={source} onChange={(event) => setSource(event.target.value as WorkArtifact["source"] | "all")}>
            <option value="all">All</option>
            {sources.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label className="agentsam-work-toolbar-button">Type: <select aria-label="Filter by type" value={kind} onChange={(event) => setKind(event.target.value as WorkArtifact["kind"] | "all")}>
            <option value="all">All</option>
            {kinds.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
        </div>

        <section className="agentsam-work-card agentsam-work-artifacts__card">
          <div className="agentsam-work-artifacts__card-heading">
            <div>
              <h2>{heading}</h2>
              <div className="agentsam-work-artifacts__subtitle">Verified registered files, grouped by storage source</div>
            </div>
            <div className="agentsam-work-artifacts__spacer" />
            <span className="agentsam-work-artifacts__muted">{visible.length} items</span>
            <span className="agentsam-work-artifacts__muted">Registered sources</span>
          </div>

          <div className={`agentsam-work-artifacts__items${grid ? " is-grid" : " is-list"}`}>
            {!visible.length ? (
              <div className="agentsam-work-empty agentsam-work-artifacts__empty">
                <strong>{artifacts.length > 0 && filtered ? "No matching artifacts" : "No artifacts yet"}</strong>
                <p>{view !== "all"
                  ? "No registered files have verified " + view + " metadata in this provider view. This is not proof the provider is empty."
                  : source === "all" ? emptyMessage
                  : "No " + source + " files returned by the active Work storage adapter. An OAuth connection alone does not establish file listing access."}</p>
              </div>
            ) : null}
            {visible.map((artifact) => {
              const Icon = iconFor(artifact.kind);
              return (
                <article key={artifact.id} className="agentsam-work-artifacts__item">
                  <div className="agentsam-work-artifacts__item-heading">
                    <Icon size={16} aria-hidden="true" />
                    <span>{artifact.name}</span>
                  </div>

                  {grid ? (
                    <div className="agentsam-work-artifacts__preview">
                      {artifact.kind === "image" && artifact.preview ? (
                        <img src={artifact.preview} alt={artifact.name} loading="lazy" decoding="async" />
                      ) : <div className="agentsam-work-artifacts__no-preview"><Icon size={32} aria-hidden="true" /><span>{artifact.preview ? "Preview unavailable" : "No preview"}</span></div>}
                    </div>
                  ) : null}

                  <div className="agentsam-work-artifacts__meta">
                    {artifact.source} · {artifact.sizeLabel || "—"} · {artifact.updatedLabel || "—"}
                  </div>
                  {artifact.source === "local" && onOpenArtifact ?
                    <button type="button" className="agentsam-work-toolbar-button"
                      onClick={() => void onOpenArtifact(artifact)}>Open in Files editor</button> : null}
                  {artifact.preview ? <a className="agentsam-work-toolbar-button" href={artifact.preview}
                    target="_blank" rel="noopener noreferrer">View preview</a> : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
