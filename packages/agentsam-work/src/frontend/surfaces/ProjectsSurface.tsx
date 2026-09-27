import { Camera, MoreHorizontal, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkNavigate, WorkProject } from "../../contracts/index";

export function ProjectsSurface({
  projects,
  onNavigate,
}: {
  projects: WorkProject[];
  onNavigate: WorkNavigate;
}) {
  const [tab, setTab] = useState<"mine" | "recent" | "shared" | "archived" | "starred">("mine");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 24px 72px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-.03em" }}>Projects</h1>
        <div style={{ flex: 1 }} />
        <label
          style={{
            width: 38,
            height: 38,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            border: "1px solid var(--agentsam-work-border)",
            cursor: "pointer",
          }}
        >
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            aria-label="Search projects"
          />
        </label>
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          data-primary="true"
          style={{ width: 38, height: 38, padding: 0, borderRadius: "50%" }}
          aria-label="New project"
        >
          <Plus size={18} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        {([
          ["mine", "My Projects"],
          ["recent", "Recent"],
          ["shared", "Shared"],
          ["archived", "Archived"],
          ["starred", "Starred"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="agentsam-work-toolbar-button"
            data-primary={tab === id}
            onClick={() => setTab(id as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {visible.map((project) => (
          <article
            key={project.id}
            className="agentsam-work-card"
            style={{
              overflow: "hidden",
              minHeight: 280,
              borderTop: "3px solid " + project.accent,
              background: "color-mix(in srgb, var(--agentsam-work-panel) 88%, " + project.accent + " 12%)",
            }}
          >
            <div
              style={{
                position: "relative",
                height: 145,
                display: "grid",
                placeItems: "center",
                background:
                  project.coverImageUrl === "fixture:companions"
                    ? "linear-gradient(135deg, #fff, #f9f9f9)"
                    : "color-mix(in srgb, var(--agentsam-work-panel-subtle) 85%, " + project.accent + " 15%)",
              }}
            >
              {project.coverImageUrl === "fixture:companions" ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: "-.08em" }}>CPAS</div>
                  <div style={{ fontSize: 10, letterSpacing: ".25em" }}>COMPANIONS</div>
                </div>
              ) : (
                <Camera size={20} color="var(--agentsam-work-muted)" />
              )}
              <button
                type="button"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 28,
                  height: 28,
                  display: "grid",
                  placeItems: "center",
                  border: 0,
                  borderRadius: 8,
                  background: "rgb(0 0 0 / 55%)",
                  color: "white",
                }}
                aria-label={"More actions for " + project.name}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("/projects/" + encodeURIComponent(project.id))}
              style={{
                width: "100%",
                minHeight: 132,
                display: "block",
                padding: 14,
                border: 0,
                background: "transparent",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 13 }}>{project.name}</h2>
              <div style={{ marginTop: 6, color: "var(--agentsam-work-muted)", fontSize: 10 }}>{project.projectType || "project"}</div>
              <div style={{ marginTop: 18, height: 3, borderRadius: 99, background: "var(--agentsam-work-border)" }}>
                <span
                  style={{
                    display: "block",
                    width: Math.max(2, project.progress) + "%",
                    height: "100%",
                    borderRadius: 99,
                    background: project.accent,
                  }}
                />
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    background: project.accent,
                    color: "white",
                    fontSize: 8,
                    fontWeight: 700,
                  }}
                >
                  {project.initials}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ color: "var(--agentsam-work-success)", fontSize: 9, textTransform: "capitalize" }}>
                  {project.status === "active" ? "In Development" : project.status}
                </span>
              </div>
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
