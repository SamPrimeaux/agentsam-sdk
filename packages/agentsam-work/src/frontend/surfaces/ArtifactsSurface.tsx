import { FileArchive, FileCode2, FileImage, FileText, Grid2X2, List, MoreVertical } from "lucide-react";
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
  const visible = useMemo(
    () => artifacts.filter((artifact) => artifact.name.toLowerCase().includes(query.toLowerCase())),
    [artifacts, query],
  );

  return (
    <div style={{ padding: "14px 16px 72px", minWidth: 680 }}>
      <div style={{ maxWidth: 760, margin: "0 auto 14px" }}>
        <WorkSearch value={query} onChange={setQuery} placeholder="Search files across sources" />
      </div>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>All sources</h1>
          <div style={{ flex: 1 }} />
          <button type="button" className="agentsam-work-toolbar-button" onClick={() => setGrid(false)} aria-label="List view">
            <List size={15} />
          </button>
          <button type="button" className="agentsam-work-toolbar-button" data-primary={grid} onClick={() => setGrid(true)} aria-label="Grid view">
            <Grid2X2 size={15} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="agentsam-work-toolbar-button">{visible.length} items</button>
          <button type="button" className="agentsam-work-toolbar-button">Source: All</button>
          <button type="button" className="agentsam-work-toolbar-button">Type: All</button>
        </div>

        <section className="agentsam-work-card" style={{ marginTop: 16, padding: 14, borderLeft: "3px solid #c83cff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 14 }}>My artifacts</h2>
              <div style={{ marginTop: 3, color: "var(--agentsam-work-muted)", fontSize: 10 }}>
                Saved generations, uploads and AgentSam artifacts
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ color: "var(--agentsam-work-muted)", fontSize: 10 }}>{visible.length} items</span>
            <button type="button" className="agentsam-work-toolbar-button">Open lane</button>
          </div>

          <div
            style={{
              marginTop: 14,
              display: grid ? "grid" : "block",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            {!visible.length ? (
              <div className="agentsam-work-empty" style={{ gridColumn: "1 / -1", padding: "28px 12px" }}>
                <strong style={{ display: "block", fontSize: 14 }}>No artifacts yet</strong>
                <p style={{ margin: "8px 0 0", color: "var(--agentsam-work-muted)", fontSize: 12, lineHeight: 1.55 }}>
                  Account-owned files from R2 and connected sources will appear here. This view is not backed by sample fixture content.
                </p>
              </div>
            ) : null}
            {visible.map((artifact) => {
              const Icon = iconFor(artifact.kind);
              return (
                <article
                  key={artifact.id}
                  style={{
                    overflow: "hidden",
                    borderRadius: 12,
                    background: "var(--agentsam-work-panel-subtle)",
                    marginBottom: grid ? 0 : 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px" }}>
                    <Icon size={16} color="var(--agentsam-work-accent)" />
                    <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                      {artifact.name}
                    </span>
                    <MoreVertical size={15} color="var(--agentsam-work-muted)" />
                  </div>

                  {grid ? (
                    <div style={{ padding: "0 10px 10px" }}>
                      <div
                        style={{
                          height: 150,
                          display: "grid",
                          placeItems: "center",
                          borderRadius: 8,
                          background:
                            artifact.kind === "image"
                              ? "linear-gradient(135deg, #172033, #315b7f 45%, #80d8ff)"
                              : "var(--agentsam-work-panel)",
                          border: "1px solid color-mix(in srgb, var(--agentsam-work-border) 70%, transparent)",
                        }}
                      >
                        {artifact.kind !== "image" ? (
                          <div style={{ width: "78%", display: "grid", gap: 8 }}>
                            {[78, 64, 84, 58, 90, 74].map((width, index) => (
                              <span
                                key={index}
                                style={{
                                  display: "block",
                                  height: index < 4 ? 8 : 7,
                                  width: width + "%",
                                  borderRadius: 99,
                                  background:
                                    index === 0
                                      ? "#ee817b"
                                      : index === 1
                                        ? "#7fc89c"
                                        : index === 2
                                          ? "#9bbcf2"
                                          : index === 3
                                            ? "#f5d167"
                                            : "#dce3ed",
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <FileImage size={42} color="white" />
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ padding: grid ? "0 10px 10px" : "0 10px 10px", color: "var(--agentsam-work-muted)", fontSize: 9 }}>
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
