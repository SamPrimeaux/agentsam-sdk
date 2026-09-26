import {
  ArrowLeft,
  CheckCircle2,
  Link2,
  Play,
  RefreshCw,
} from "lucide-react";
import type { WorkNavigate, WorkTicket } from "../../contracts/index";

function prettyStatus(status: WorkTicket["status"]) {
  return status.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function TicketDetailSurface({
  ticket,
  onNavigate,
}: {
  ticket: WorkTicket;
  onNavigate: WorkNavigate;
}) {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 72px" }}>
      <button
        type="button"
        onClick={() => onNavigate("/artifacts/tickets")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: 0,
          background: "transparent",
          color: "var(--agentsam-work-muted)",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={14} />
        All tickets
      </button>

      <header style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <code style={{ color: "var(--agentsam-work-muted)", fontSize: 10 }}>{ticket.id}</code>
          {ticket.priority ? (
            <span style={{ color: ticket.priority === "P0" ? "var(--agentsam-work-danger)" : "var(--agentsam-work-muted)", fontSize: 10, fontWeight: 700 }}>
              {ticket.priority}
            </span>
          ) : null}
          <span
            style={{
              borderRadius: 99,
              padding: "4px 9px",
              background: "var(--agentsam-work-accent-soft)",
              color: "var(--agentsam-work-accent)",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {prettyStatus(ticket.status)}
          </span>
          <span style={{ color: "var(--agentsam-work-muted)", fontSize: 10 }}>{ticket.surface}</span>
        </div>
        <h1 style={{ margin: "10px 0 0", fontSize: 26, lineHeight: 1.2, letterSpacing: "-.025em" }}>
          {ticket.title}
        </h1>
        {ticket.description ? (
          <p style={{ margin: "12px 0 0", maxWidth: 760, color: "var(--agentsam-work-muted)", fontSize: 12, lineHeight: 1.65 }}>
            {ticket.description}
          </p>
        ) : null}
      </header>

      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        <button type="button" className="agentsam-work-toolbar-button" data-primary="true">
          <Play size={14} />
          Start work
        </button>
        <button type="button" className="agentsam-work-toolbar-button">
          <CheckCircle2 size={14} />
          Close with proof
        </button>
        <button type="button" className="agentsam-work-toolbar-button">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, .75fr)", gap: 14, marginTop: 24 }}>
        <section className="agentsam-work-card" style={{ padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 13 }}>Execution evidence</h2>
          <div style={{ marginTop: 12, minHeight: 150, borderRadius: 10, background: "var(--agentsam-work-panel-subtle)", padding: 14 }}>
            <div style={{ color: "var(--agentsam-work-muted)", fontSize: 10, lineHeight: 1.65 }}>
              Runtime receipts, validation proof, agent notes, and linked artifacts land here. The Work package renders normalized evidence; the host owns storage and verification.
            </div>
          </div>
        </section>

        <aside className="agentsam-work-card" style={{ padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 13 }}>Relationships</h2>
          <div style={{ display: "grid", gap: 12, marginTop: 14, fontSize: 10 }}>
            <div>
              <div style={{ color: "var(--agentsam-work-muted)" }}>Project</div>
              <div style={{ marginTop: 3 }}>{ticket.project || "—"}</div>
            </div>
            <div>
              <div style={{ color: "var(--agentsam-work-muted)" }}>Blocked by</div>
              <div style={{ marginTop: 5, display: "grid", gap: 5 }}>
                {ticket.blockedBy.length ? ticket.blockedBy.map((id) => (
                  <code key={id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Link2 size={11} /> {id}
                  </code>
                )) : <span>None</span>}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--agentsam-work-muted)" }}>Blocks</div>
              <div style={{ marginTop: 5, display: "grid", gap: 5 }}>
                {ticket.blocks.length ? ticket.blocks.map((id) => (
                  <code key={id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Link2 size={11} /> {id}
                  </code>
                )) : <span>None</span>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
