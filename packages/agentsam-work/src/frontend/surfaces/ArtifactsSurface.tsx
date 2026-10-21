import { FileArchive, FileCode2, FileImage, FileText, Grid2X2, List } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkArtifact } from "../../contracts/index";
import { WorkSearch } from "../WorkShell";

function iconFor(kind: WorkArtifact["kind"]) {
  if (kind === "image") return FileImage;
  if (kind === "code") return FileCode2;
  if (kind === "archive") return FileArchive;
  return FileText;
}

export function ArtifactsSurface({ artifacts }: { artifacts: WorkArtifact[] }) {
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(true);
  const [source, setSource] = useState<WorkArtifact["source"] | "all">("all");
  const [kind, setKind] = useState<WorkArtifact["kind"] | "all">("all");
  const sources = [...new Set(artifacts.map((artifact) => artifact.source))].sort();
  const kinds = [...new Set(artifacts.map((artifact) => artifact.kind))].sort();
  const visible = useMemo(
    () => artifacts.filter((artifact) =>
      artifact.name.toLowerCase().includes(query.toLowerCase()) &&
      (source === "all" || artifact.source === source) &&
      (kind === "all" || artifact.kind === kind),
    ),
    [artifacts, query, source, kind],
  );
  const filtered = Boolean(query || source !== "all" || kind !== "all");

  return (
    <div className="agentsam-work-artifacts">
      <div className="agentsam-work-artifacts__search">
        <WorkSearch value={query} onChange={setQuery} placeholder="Search files across sources" />
      </div>

      <div className="agentsam-work-artifacts__content">
        <div className="agentsam-work-artifacts__heading">
          <h1>All sources</h1>
          <div className="agentsam-work-artifacts__spacer" />
          <button type="button" className="agentsam-work-toolbar-button" data-primary={!grid} onClick={() => setGrid(false)} aria-label="List view">
            <List size={15} />
          </button>
          <button type="button" className="agentsam-work-toolbar-button" data-primary={grid} onClick={() => setGrid(true)} aria-label="Grid view">
            <Grid2X2 size={15} />
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
              <h2>My artifacts</h2>
              <div className="agentsam-work-artifacts__subtitle">Saved generations, uploads and AgentSam artifacts</div>
            </div>
            <div className="agentsam-work-artifacts__spacer" />
            <span className="agentsam-work-artifacts__muted">{visible.length} items</span>
            <span className="agentsam-work-artifacts__muted">All account files</span>
          </div>

          <div className={`agentsam-work-artifacts__items${grid ? " is-grid" : " is-list"}`}>
            {!visible.length ? (
              <div className="agentsam-work-empty agentsam-work-artifacts__empty">
                <strong>{artifacts.length > 0 && filtered ? "No matching artifacts" : "No artifacts yet"}</strong>
                <p>Account-owned files from R2 and connected sources will appear here. This view is not backed by sample fixture content.</p>
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
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
