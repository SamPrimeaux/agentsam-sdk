import { CalendarDays, ChevronDown, ExternalLink, Folder, GitBranch, MoreHorizontal, RefreshCw, Send, Star, Timer, Users } from "lucide-react";
import { useState } from "react";
import type { WorkNavigate, WorkProject } from "../../contracts/index";

export function ProjectDetailSurface({
  project,
  onNavigate,
}: {
  project: WorkProject;
  onNavigate: WorkNavigate;
}) {
  const [prompt, setPrompt] = useState("");

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", minWidth: 820 }}>
      <main style={{ minWidth: 0, overflowY: "auto", padding: "28px 34px 72px" }}>
        <button
          type="button"
          onClick={() => onNavigate("/projects")}
          style={{ border: 0, background: "transparent", color: "var(--agentsam-work-muted)", fontSize: 10, cursor: "pointer" }}
        >
          ← All projects
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <h1 style={{ margin: 0, minWidth: 0, flex: 1, fontSize: 28, letterSpacing: "-.03em" }}>{project.name}</h1>
          <RefreshCw size={15} color="var(--agentsam-work-muted)" />
          <MoreHorizontal size={17} color="var(--agentsam-work-muted)" />
          <Star size={16} color="var(--agentsam-work-muted)" />
        </div>

        <div
          className="agentsam-work-card"
          style={{
            marginTop: 20,
            padding: 14,
            background: "var(--agentsam-work-panel-subtle)",
          }}
        >
          <div style={{ fontSize: 12 }}>How can I help you today?</div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="Ask AgentSam about this project…"
            style={{
              width: "100%",
              resize: "vertical",
              marginTop: 8,
              border: 0,
              outline: 0,
              background: "transparent",
              color: "var(--agentsam-work-text)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="agentsam-work-toolbar-button" data-primary="true" aria-label="Send">
              <Send size={14} />
            </button>
          </div>
        </div>

        <div style={{ marginTop: 34, color: "var(--agentsam-work-muted)", fontSize: 11 }}>
          No chats in this project yet. Start one above — AgentSam opens full-screen with this project linked.
        </div>
      </main>

      <aside style={{ minHeight: 0, overflowY: "auto", borderLeft: "1px solid var(--agentsam-work-border)", background: "var(--agentsam-work-panel-subtle)" }}>
        <section style={{ padding: 18, borderBottom: "1px solid var(--agentsam-work-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 12 }}>Quick stats</strong>
            <ChevronDown size={13} />
            <div style={{ flex: 1 }} />
            <RefreshCw size={13} />
            <ExternalLink size={13} />
          </div>
          <div style={{ marginTop: 14, color: "var(--agentsam-work-muted)", fontSize: 9, textTransform: "uppercase" }}>This week</div>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>Project insights</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 14 }}>
            <button className="agentsam-work-toolbar-button" data-primary="true" type="button">Week</button>
            <button className="agentsam-work-toolbar-button" type="button">Month</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 10 }}>
            <button className="agentsam-work-toolbar-button" data-primary="true" type="button">Time</button>
            <button className="agentsam-work-toolbar-button" type="button">Cost</button>
            <button className="agentsam-work-toolbar-button" type="button">Progress</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button className="agentsam-work-toolbar-button" type="button"><Timer size={14} /> Start</button>
            <div style={{ flex: 1 }} />
            <span style={{ color: "var(--agentsam-work-muted)", fontSize: 10 }}>Today</span>
            <strong style={{ fontSize: 11 }}>{project.trackedMinutes}m</strong>
          </div>

          <div
            style={{
              width: 86,
              height: 86,
              margin: "12px auto 0",
              borderRadius: "50%",
              background: "conic-gradient(var(--agentsam-work-success) 0 78%, var(--agentsam-work-border) 78% 100%)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--agentsam-work-panel-subtle)" }} />
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 10 }}>
            <div style={{ display: "flex" }}><span>Tracked today</span><span style={{ marginLeft: "auto" }}>{project.trackedMinutes}m</span></div>
            <div style={{ display: "flex" }}><span>Open tasks</span><span style={{ marginLeft: "auto" }}>{project.openTasks}</span></div>
            <div style={{ display: "flex" }}><span>Progress</span><span style={{ marginLeft: "auto" }}>{project.progress}%</span></div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="agentsam-work-toolbar-button" type="button"><Users size={13} /> Tasks</button>
            <button className="agentsam-work-toolbar-button" type="button"><CalendarDays size={13} /> Calendar</button>
            <button className="agentsam-work-toolbar-button" type="button"><ExternalLink size={13} /> Collaborate</button>
          </div>
        </section>

        <section style={{ padding: 18, borderBottom: "1px solid var(--agentsam-work-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 12 }}>Codebase index</strong>
            <ChevronDown size={13} />
            <div style={{ flex: 1 }} />
            <GitBranch size={14} />
            <RefreshCw size={13} />
          </div>
          <p style={{ color: "var(--agentsam-work-muted)", fontSize: 10, lineHeight: 1.5 }}>
            {project.githubRepo ? "Repository linked and ready for indexing." : "Connect a GitHub repository to index and search this project's code."}
          </p>
          <button className="agentsam-work-toolbar-button" type="button">
            <GitBranch size={13} /> {project.githubRepo ? project.githubRepo : "Connect GitHub repo"}
          </button>
        </section>

        {([
          ["Brand assets", Folder],
          ["Cover", Folder],
          ["Memory", Folder],
        ] as const).map(([label, Icon]) => (
          <section key={String(label)} style={{ padding: 18, borderBottom: "1px solid var(--agentsam-work-border)", display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 12 }}>{label}</strong>
            <ChevronDown size={13} />
            <div style={{ flex: 1 }} />
            <Icon size={14} />
            <ExternalLink size={13} />
          </section>
        ))}
      </aside>
    </div>
  );
}
