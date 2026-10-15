import type { WorkProject, WorkTicket, WorkTicketStatus } from "../contracts/index";
import type { TimelineItem } from "./TimelineView";

export const STATUS_ORDER: WorkTicketStatus[] = ["in_review", "active", "blocked", "backlog", "shipped", "abandoned"];
export const BOARD_STATUSES: WorkTicketStatus[] = ["backlog", "active", "in_review", "blocked", "shipped"];

export const STATUS_LABEL: Record<WorkTicketStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  blocked: "Blocked",
  in_review: "In review",
  shipped: "Shipped",
  abandoned: "Abandoned",
};

export const STATUS_TONE: Record<WorkTicketStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  backlog: "neutral",
  active: "accent",
  blocked: "danger",
  in_review: "warning",
  shipped: "success",
  abandoned: "neutral",
};

export const isOpen = (t: WorkTicket) => t.status !== "shipped" && t.status !== "abandoned";

export function priorityRank(priority?: string | null): number {
  const p = (priority || "").toLowerCase();
  if (/(^p?0$)|urgent|critical/.test(p)) return 0;
  if (/(^p?1$)|high/.test(p)) return 1;
  if (/(^p?2$)|medium|normal/.test(p)) return 2;
  if (/(^p?3$)|low/.test(p)) return 3;
  return 9;
}

export const sameProject = (ticket: WorkTicket, project: WorkProject) => {
  const key = (ticket.project || "").trim().toLowerCase();
  return Boolean(key) && (key === project.id.toLowerCase() || key === project.name.toLowerCase());
};

export type Recommendation = { ticket: WorkTicket; reason: string; action: string };

/**
 * Derives the suggested execution order from the tickets themselves:
 * in-review first (close with proof), then unblocked work that unblocks the most,
 * ordered by priority and due date. Nothing here is hardcoded.
 */
export function recommendOrder(tickets: WorkTicket[], now = Date.now()) {
  const open = tickets.filter(isOpen);
  const openIds = new Set(open.map((t) => t.id));
  const unblocks = new Map<string, number>();
  for (const t of open) {
    for (const blocker of t.blockedBy) if (openIds.has(blocker)) unblocks.set(blocker, (unblocks.get(blocker) || 0) + 1);
    for (const blocked of t.blocks) if (openIds.has(blocked)) unblocks.set(t.id, (unblocks.get(t.id) || 0) + 1);
  }
  const isBlocked = (t: WorkTicket) => t.status === "blocked" || t.blockedBy.some((id) => openIds.has(id));
  const group = (t: WorkTicket) => (isBlocked(t) ? 3 : t.status === "in_review" ? 0 : t.status === "active" ? 1 : 2);

  const ranked = open
    .filter((t) => group(t) < 3)
    .sort((a, b) => {
      const g = group(a) - group(b);
      if (g) return g;
      const p = priorityRank(a.priority) - priorityRank(b.priority);
      if (p) return p;
      const u = (unblocks.get(b.id) || 0) - (unblocks.get(a.id) || 0);
      if (u) return u;
      const da = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const db = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      if (da !== db) return da - db;
      return b.updatedAt - a.updatedAt;
    });

  const batch: Recommendation[] = ranked.slice(0, 6).map((ticket) => {
    const n = unblocks.get(ticket.id) || 0;
    const overdue = ticket.dueAt && Date.parse(ticket.dueAt) < now;
    const reason =
      ticket.status === "in_review"
        ? "In review — close with proof"
        : n > 0
          ? `Unblocks ${n} ticket${n === 1 ? "" : "s"}`
          : overdue
            ? "Overdue"
            : priorityRank(ticket.priority) <= 1
              ? `${ticket.priority} priority`
              : STATUS_LABEL[ticket.status];
    const action = ticket.status === "in_review" ? "Ship" : ticket.status === "backlog" ? "Start" : "Open";
    return { ticket, reason, action };
  });

  const title = (id: string) => tickets.find((t) => t.id === id)?.title || id;
  const edges = new Set<string>();
  for (const t of open) {
    for (const blocker of t.blockedBy) if (openIds.has(blocker)) edges.add(`${title(blocker)} → ${t.title}`);
    for (const blocked of t.blocks) if (openIds.has(blocked)) edges.add(`${t.title} → ${title(blocked)}`);
  }
  return { batch, dependencies: [...edges].slice(0, 8), openCount: open.length, blockedCount: open.length - ranked.length };
}

const COLOR: Partial<Record<WorkTicketStatus, string>> = {
  shipped: "var(--agentsam-work-success)",
  blocked: "var(--agentsam-work-danger)",
  in_review: "var(--agentsam-work-warning)",
};

export function timelineItems(tickets: WorkTicket[]): { items: TimelineItem[]; undated: number } {
  const items: TimelineItem[] = [];
  let undated = 0;
  for (const t of tickets) {
    const due = t.dueAt ? Date.parse(t.dueAt) : NaN;
    const startRaw = t.startAt ? Date.parse(t.startAt) : NaN;
    if (!Number.isFinite(due) && !Number.isFinite(startRaw)) {
      undated += 1;
      continue;
    }
    const day = 86_400_000;
    const estimate = (t.estimatedMinutes || 0) * 60_000;
    const end = Number.isFinite(due) ? due : startRaw + Math.max(day, estimate);
    const start = Number.isFinite(startRaw) ? startRaw : Math.min(end - Math.max(day, estimate), end - day);
    items.push({
      id: t.id,
      title: t.title,
      start: new Date(start).toISOString(),
      end: new Date(Math.max(end, start + day / 2)).toISOString(),
      progress: t.status === "shipped" ? 100 : t.percentComplete ?? 0,
      color: COLOR[t.status],
      meta: t.priority || undefined,
    });
  }
  return { items, undated };
}
