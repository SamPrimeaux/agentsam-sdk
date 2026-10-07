import { useMemo, useState } from "react";
import type { WorkTicket } from "../../contracts/index";

function statusLabel(status: WorkTicket["status"]) {
  return status.replace("_", " ").toUpperCase();
}

export function TicketsSurface({
  tickets,
  analytics,
  scope = "all",
  onOpenTicket,
}: {
  tickets: WorkTicket[];
  analytics: { completionRate: number; avgCycleDays: number; oldestActiveDays: number };
  scope?: "all" | "platform" | "collaborate";
  onOpenTicket?: (ticket: WorkTicket) => void;
}) {
  const [mode, setMode] = useState<"queue" | "board">("queue");
  const visible = useMemo(
    () => (scope === "all" ? tickets : tickets.filter((ticket) => ticket.surface === scope)),
    [scope, tickets],
  );

  const next = visible.slice(0, 4);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 18px 64px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          data-primary={mode === "queue"}
          onClick={() => setMode("queue")}
        >
          Queue
        </button>
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          data-primary={mode === "board"}
          onClick={() => setMode("board")}
        >
          Board
        </button>
        <span style={{ marginLeft: 8, fontSize: 12, color: "var(--agentsam-work-muted)" }}>
          {analytics.completionRate}% complete · {analytics.avgCycleDays}d avg · oldest {analytics.oldestActiveDays}d
        </span>
        <div style={{ flex: 1 }} />
        <select className="agentsam-work-toolbar-button" defaultValue="priority">
          <option value="priority">Sort: priority</option>
          <option value="updated">Sort: updated</option>
        </select>
        <button type="button" className="agentsam-work-toolbar-button">Refresh</button>
        <button type="button" className="agentsam-work-toolbar-button">New ticket</button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 12,
          border: "1px solid color-mix(in srgb, var(--agentsam-work-accent) 35%, var(--agentsam-work-border))",
          background: "var(--agentsam-work-accent-soft)",
        }}
      >
        <div style={{ color: "var(--agentsam-work-accent)", fontSize: 12, fontWeight: 700 }}>
          Recommended execution order
        </div>
        <div style={{ marginTop: 6, color: "var(--agentsam-work-text)", fontSize: 11, lineHeight: 1.55 }}>
          Close in review with proof first → Finding #3 unlocks ledger Phase B → reward single-writer unlocks cost_mean loop → child routing P0s.
        </div>
      </div>

      <section className="agentsam-work-card" style={{ marginTop: 14, padding: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>Suggested next batch</h3>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "var(--agentsam-work-muted)", textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Ticket</th>
                <th style={{ padding: "8px 6px" }}>Why now</th>
                <th style={{ padding: "8px 6px" }}>Validation shortcut</th>
              </tr>
            </thead>
            <tbody>
              {next.map((ticket) => (
                <tr key={ticket.id} style={{ borderTop: "1px solid var(--agentsam-work-border)" }}>
                  <td style={{ padding: "10px 6px", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{ticket.id}</td>
                  <td style={{ padding: "10px 6px" }}>{ticket.description || ticket.title}</td>
                  <td style={{ padding: "10px 6px" }}>
                    {ticket.status === "in_review" ? "Proof + expected receipt" : "Run target check then update status"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="agentsam-work-card" style={{ marginTop: 14, padding: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>Dependency sketch</h3>
        <pre
          style={{
            margin: "10px 0 0",
            overflowX: "auto",
            color: "var(--agentsam-work-muted)",
            fontSize: 10,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
          }}
        >
          {"hardcoded_routing_audit → inferIntent → code hub + image guards\nfinding_3_pending_status → ledger_ownership_b\nreward_events_tenant → arm_cost_mean_loop → consolidate_arm_writers"}
        </pre>
      </section>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <strong>In review — close with proof</strong>
          <span style={{ color: "var(--agentsam-work-muted)" }}>{visible.filter((ticket) => ticket.status === "in_review").length}</span>
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {visible.map((ticket) => (
            <article key={ticket.id} className="agentsam-work-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" aria-label={"Select " + ticket.title} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <code style={{ color: "var(--agentsam-work-muted)", fontSize: 9 }}>{ticket.id}</code>
                    {ticket.priority ? (
                      <span style={{ color: ticket.priority === "P0" ? "var(--agentsam-work-danger)" : "var(--agentsam-work-muted)", fontSize: 10, fontWeight: 700 }}>
                        {ticket.priority}
                      </span>
                    ) : null}
                    <span
                      style={{
                        borderRadius: 99,
                        padding: "3px 8px",
                        background: "var(--agentsam-work-accent-soft)",
                        color: "var(--agentsam-work-accent)",
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      {statusLabel(ticket.status)}
                    </span>
                    <span style={{ color: "var(--agentsam-work-muted)", fontSize: 9 }}>{ticket.surface}</span>
                  </div>
                  <h4 style={{ margin: "7px 0 0", fontSize: 13 }}>{ticket.title}</h4>
                  {ticket.description ? (
                    <p style={{ margin: "7px 0 0", color: "var(--agentsam-work-muted)", fontSize: 10, lineHeight: 1.5 }}>
                      {ticket.description}
                    </p>
                  ) : null}
                </div>
                {onOpenTicket ? (
                  <button
                    type="button"
                    className="agentsam-work-toolbar-button"
                    onClick={() => onOpenTicket(ticket)}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
