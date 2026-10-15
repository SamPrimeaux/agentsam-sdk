import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { WorkTicket } from "../contracts/index";
import { formatDate } from "./shared";
import { priorityLabel, STATUS_LABEL } from "./ticket-plan";

const PAGE = 35;

/** Dense, keyboard-accessible ticket rows for Projects and Tickets alike.
 * No duplicated ticket state; selects the canonical Work ticket editor. */
export function TicketTable({
  tickets,
  onOpenTicket,
  compact = false,
}: {
  tickets: WorkTicket[];
  onOpenTicket: (ticket: WorkTicket) => void;
  compact?: boolean;
}) {
  const [limit, setLimit] = useState(compact ? 5 : PAGE);
  const sorted = useMemo(() => tickets.slice(0, limit), [tickets, limit]);

  if (!tickets.length) return <div className="aw-ticket-table__empty">No matching tickets yet.</div>;
  return (
    <section className="aw-ticket-table-wrap" aria-label="Tickets">
      <div className="aw-ticket-table__scroll">
        <table className="aw-ticket-table">
          <thead><tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Due date</th><th>Dependencies</th><th aria-label="Open ticket"/></tr></thead>
          <tbody>
            {sorted.map((ticket) => <tr key={ticket.id} className="aw-ticket-table__row" onClick={() => onOpenTicket(ticket)}>
              <td>
                <button type="button" className="aw-ticket-table__title" onClick={(event) => { event.stopPropagation(); onOpenTicket(ticket); }}>
                  <small>{ticket.id.replace(/^tkt_/, "").slice(0, 10)}</small>
                  <strong title={ticket.title}>{ticket.title}</strong>
                </button>
              </td>
              <td><span className="aw-ticket-table__status" data-status={ticket.status}>{ticket.status === "shipped" ? <CheckCircle2 size={12}/> : null}{STATUS_LABEL[ticket.status]}</span></td>
              <td><span className="aw-ticket-table__priority" data-priority={priorityLabel(ticket.priority)}>{priorityLabel(ticket.priority)}</span></td>
              <td><span className="aw-ticket-table__due">{ticket.dueAt ? formatDate(ticket.dueAt) : "Not set"}</span></td>
              <td><span className="aw-ticket-table__dependencies">{ticket.blockedBy.length ? ticket.blockedBy.length + " blockers" : "—"}</span></td>
              <td><button type="button" className="aw-ticket-table__open" onClick={(event) => { event.stopPropagation(); onOpenTicket(ticket); }} aria-label={"Open " + ticket.title}><ArrowUpRight size={15}/></button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {tickets.length > limit ? <button className="aw-ticket-table__more" type="button" onClick={() => setLimit((current) => current + PAGE)}>
        Show {Math.min(PAGE, tickets.length - limit)} more · {tickets.length - limit} remaining
      </button> : null}
    </section>
  );
}
