import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkCapabilities, WorkProject, WorkTicket, WorkTicketInput, WorkTicketStatus } from "../../contracts/index";
import { Empty, ErrorLine, formatDate, Pill, useAction } from "../shared";
import { TicketEditor } from "../TicketEditor";
import { TicketTable } from "../TicketTable";
import { TimelineView } from "../TimelineView";
import {
  BOARD_STATUSES,
  isOpen,
  priorityRank,
  recommendOrder,
  sameProject,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  timelineItems,
} from "../ticket-plan";

type Mode = "queue" | "board" | "timeline";
type Sort = "priority" | "updated" | "due";
const PAGE = 40;

export function TicketsSurface({
  tickets,
  analytics,
  projects = [],
  capabilities,
  projectId,
  embedded = false,
  initialMode = "queue",
  hideModeTabs = false,
  onCreate,
  onUpdate,
  onDelete,
  onSchedule,
  onRefresh,
  onOpenTicket,
  onCreateTicket,
}: {
  tickets: WorkTicket[];
  analytics?: { completionRate: number; avgCycleDays: number; oldestActiveDays: number };
  projects?: WorkProject[];
  capabilities?: WorkCapabilities["tickets"];
  /** When set, tickets are scoped to this project and new tickets default to it. */
  projectId?: string;
  embedded?: boolean;
  initialMode?: "queue" | "board" | "timeline";
  /** Project detail already owns the top-level view switch. */
  hideModeTabs?: boolean;
  onCreate?: (input: WorkTicketInput & { title: string }) => Promise<unknown>;
  onUpdate?: (id: string, patch: WorkTicketInput) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
  onSchedule?: (ticket: WorkTicket) => Promise<unknown>;
  onRefresh?: () => Promise<unknown> | void;
  onOpenTicket?: (ticket: WorkTicket) => void;
  onCreateTicket?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 800px)").matches
  );
  const [lane, setLane] = useState("all");
  const [project, setProject] = useState("all");
  const [sort, setSort] = useState<Sort>("priority");
  const [editing, setEditing] = useState<WorkTicket | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const { busy, error, run } = useAction();

  const caps = capabilities ?? { create: Boolean(onCreate), update: Boolean(onUpdate), delete: Boolean(onDelete) };
  const scopeProject = projectId ? projects.find((p) => p.id === projectId) : undefined;

  const lanes = useMemo(() => [...new Set(tickets.map((t) => t.surface).filter(Boolean))].sort(), [tickets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const picked = project !== "all" && project !== "none" ? projects.find((p) => p.id === project) : undefined;
    const list = tickets.filter((t) => {
      if (scopeProject && !sameProject(t, scopeProject)) return false;
      if (lane !== "all" && t.surface !== lane) return false;
      if (project === "none" && t.project) return false;
      if (picked && !sameProject(t, picked)) return false;
      if (q && !`${t.title} ${t.id} ${t.description ?? ""} ${t.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const rank = (t: WorkTicket) => priorityRank(t.priority);
    return list.sort((a, b) => {
      if (sort === "updated") return b.updatedAt - a.updatedAt;
      if (sort === "due") return (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
      return rank(a) - rank(b) || b.updatedAt - a.updatedAt;
    });
  }, [tickets, query, lane, project, sort, projects, scopeProject]);

  const plan = useMemo(() => recommendOrder(visible), [visible]);
  const timeline = useMemo(() => timelineItems(visible), [visible]);
  const byStatus = useMemo(() => {
    const map = new Map<WorkTicketStatus, WorkTicket[]>();
    for (const status of STATUS_ORDER) map.set(status, []);
    for (const t of visible) map.get(t.status)?.push(t);
    return map;
  }, [visible]);

  const openEditor = (ticket: WorkTicket) => onOpenTicket ? onOpenTicket(ticket) : setEditing(ticket);
  const createEditor = () => onCreateTicket ? onCreateTicket() : setEditing("new");
  const patch = (id: string, input: WorkTicketInput) => run(async () => { await onUpdate?.(id, input); });
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkStatus = (status: WorkTicketStatus) =>
    run(async () => {
      for (const id of selected) await onUpdate?.(id, { status });
      setSelected(new Set());
    });
  const bulkDelete = () =>
    run(async () => {
      for (const id of selected) await onDelete?.(id);
      setSelected(new Set());
      setConfirmBulk(false);
    });

  const row = (t: WorkTicket) => (
    <div className="aw-row" key={t.id} onClick={() => openEditor(t)}>
      {caps.update || caps.delete ? (
        <input type="checkbox" aria-label={`Select ${t.title}`} checked={selected.has(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(t.id)} />
      ) : <span />}
      <code>{t.id.replace(/^tkt_/, "").slice(0, 8)}</code>
      <span className="aw-row__title" title={t.title}>{t.title}</span>
      <span className="aw-row__meta">
        {t.priority ? <Pill tone={priorityRank(t.priority) === 0 ? "danger" : "neutral"}>{t.priority}</Pill> : null}
        {t.project ? <Pill>{projects.find((p) => p.id === t.project)?.name ?? t.project}</Pill> : null}
        {t.dueAt ? <Pill tone={Date.parse(t.dueAt) < Date.now() && isOpen(t) ? "warning" : "neutral"}>due {formatDate(t.dueAt)}</Pill> : null}
        {caps.update ? (
          <select
            className="aw-select"
            style={{ width: "auto", minHeight: 28 }}
            aria-label="Status"
            value={t.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void patch(t.id, { status: e.target.value as WorkTicketStatus })}
          >
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        ) : (
          <Pill tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Pill>
        )}
      </span>
    </div>
  );

  const section = (status: WorkTicketStatus) => {
    const items = byStatus.get(status) ?? [];
    if (!items.length) return null;
    const limit = limits[status] ?? PAGE;
    const body = (
      <div className="aw-rows">
        {items.slice(0, limit).map(row)}
        {items.length > limit ? (
          <button type="button" className="aw-btn" onClick={() => setLimits((l) => ({ ...l, [status]: limit + PAGE * 2 }))}>
            Show {Math.min(PAGE * 2, items.length - limit)} more ({items.length - limit} hidden)
          </button>
        ) : null}
      </div>
    );
    const collapsed = status === "shipped" || status === "abandoned";
    return collapsed ? (
      <details key={status} style={{ marginTop: 18 }}>
        <summary className="aw-section-title" style={{ cursor: "pointer" }}>{STATUS_LABEL[status]} <span>{items.length}</span></summary>
        {body}
      </details>
    ) : (
      <div key={status}>
        <div className="aw-section-title">{status === "in_review" ? "In review — close with proof" : STATUS_LABEL[status]} <span>{items.length}</span></div>
        {body}
      </div>
    );
  };

  const stats = analytics ?? { completionRate: 0, avgCycleDays: 0, oldestActiveDays: 0 };
  const total = visible.length;

  return (
    <div className={embedded ? undefined : "aw-page"}>
      {!embedded ? (
        <div className="aw-head">
          <div>
            <p className="aw-kicker">Work</p>
            <h1>Tickets</h1>
            <p className="aw-sub">
              {total} ticket{total === 1 ? "" : "s"} · {stats.completionRate}% shipped · oldest active {stats.oldestActiveDays}d
            </p>
          </div>
          <div className="aw-actions">
            {onRefresh ? (
              <button type="button" className="aw-btn" onClick={() => void run(async () => { await onRefresh(); })} disabled={busy}>
                <RefreshCw size={14} /> Refresh
              </button>
            ) : null}
            {caps.create && onCreate ? (
              <button type="button" className="aw-btn aw-btn--primary" onClick={createEditor}>+ New ticket</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="aw-actions" style={{ marginBottom: 12 }}>
          {caps.create && onCreate ? <button type="button" className="aw-btn aw-btn--primary" onClick={createEditor}>+ New ticket</button> : null}
        </div>
      )}

      <ErrorLine message={error} />

      {!hideModeTabs ? (
        <div className="aw-tabs" role="tablist">
          {(["queue", "board", "timeline"] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" className="aw-tab" data-active={mode === m} aria-selected={mode === m} onClick={() => setMode(m)}>
              {m === "queue" ? "Queue" : m === "board" ? "Board" : "Timeline"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="aw-ticket-filters">
        <div className="aw-ticket-search">
          <input className="aw-input" placeholder="Search tickets…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tickets" />
          <button type="button" className="aw-btn" aria-expanded={showFilters} aria-controls="aw-ticket-filter-content" onClick={() => setShowFilters((shown) => !shown)}>
            Filters{lane !== "all" || project !== "all" ? " · active" : ""}
          </button>
        </div>
        {showFilters ? <div className="aw-ticket-filter-content" id="aw-ticket-filter-content">
          {lanes.length > 1 ? (
            <select className="aw-select" value={lane} onChange={(e) => setLane(e.target.value)} aria-label="Lane">
              <option value="all">All lanes</option>
              {lanes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          ) : null}
          {!scopeProject && projects.length ? (
            <select className="aw-select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
              <option value="all">All projects</option>
              <option value="none">No project</option>
              {projects.filter((p) => p.status !== "archived").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : null}
          <select className="aw-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="priority">Priority</option>
            <option value="updated">Recently updated</option>
            <option value="due">Due date</option>
          </select>
        </div> : null}
      </div>

      {mode === "queue" ? (
        <>
          {plan.batch.length ? (
            <section className="aw-focus-panel" aria-label="Recommended next actions">
              <div className="aw-focus-panel__head">
                <div><span className="aw-kicker">Focus</span><h3>Next actions</h3></div>
                <span className="aw-focus-panel__count">{plan.openCount} open · {plan.blockedCount} blocked</span>
              </div>
              <div className="aw-focus-list">
                {plan.batch.slice(0, 3).map((recommendation, index) => (
                  <button className="aw-focus-item" type="button" key={recommendation.ticket.id} onClick={() => openEditor(recommendation.ticket)}>
                    <span className="aw-focus-item__num">{index + 1}</span>
                    <span className="aw-focus-item__body"><strong>{recommendation.ticket.title}</strong><small>{recommendation.reason}</small></span>
                    <span className="aw-focus-item__go">Open</span>
                  </button>
                ))}
              </div>
              {plan.dependencies.length ? (
                <details className="aw-focus-dependencies">
                  <summary>Dependency links <span>{plan.dependencies.length}</span></summary>
                  {plan.dependencies.map(d => <p key={d} title={d}>{d}</p>)}
                </details>
              ) : null}
            </section>
          ) : null}
          {total === 0 ? (
            <Empty
              title={tickets.length ? "No tickets match these filters" : "No tickets yet"}
              hint={tickets.length ? "Clear a filter to see more." : "Create your first ticket to start tracking work."}
              action={caps.create && onCreate && !tickets.length ? <button type="button" className="aw-btn aw-btn--primary" onClick={createEditor}>+ New ticket</button> : undefined}
            />
          ) : (
            <TicketTable tickets={visible} onOpenTicket={openEditor}/>
          )}
        </>
      ) : null}

      {mode === "board" ? (
        <div className="aw-board">
          {BOARD_STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <div
                key={status}
                className="aw-col"
                data-over={dragOver === status}
                onDragOver={(e) => { if (caps.update) { e.preventDefault(); setDragOver(status); } }}
                onDragLeave={() => setDragOver((v) => (v === status ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/plain");
                  const moved = tickets.find((t) => t.id === id);
                  if (moved && moved.status !== status) void patch(id, { status });
                }}
              >
                <h4><span>{STATUS_LABEL[status]}</span><span>{items.length}</span></h4>
                {items.slice(0, limits[`b-${status}`] ?? PAGE).map((t) => (
                  <div key={t.id} className="aw-card" draggable={caps.update} onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)} onClick={() => openEditor(t)}>
                    <strong style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</strong>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {t.priority ? <Pill tone={priorityRank(t.priority) === 0 ? "danger" : "neutral"}>{t.priority}</Pill> : null}
                      {t.dueAt ? <Pill>due {formatDate(t.dueAt)}</Pill> : null}
                    </span>
                  </div>
                ))}
                {items.length > (limits[`b-${status}`] ?? PAGE) ? (
                  <button type="button" className="aw-btn" onClick={() => setLimits((l) => ({ ...l, [`b-${status}`]: (l[`b-${status}`] ?? PAGE) + PAGE * 2 }))}>
                    Show more ({items.length - (limits[`b-${status}`] ?? PAGE)})
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {mode === "timeline" ? (
        <TimelineView
          items={timeline.items}
          activityItems={timeline.activities}
          undatedCount={timeline.undated}
          onSelect={(id) => {
            const t = tickets.find((x) => x.id === id);
            if (t) openEditor(t);
          }}
        />
      ) : null}

      {selected.size ? (
        <div className="aw-bulk">
          <strong style={{ fontSize: 13 }}>{selected.size} selected</strong>
          {caps.update ? (
            <select className="aw-select" style={{ width: "auto" }} value="" onChange={(e) => e.target.value && void bulkStatus(e.target.value as WorkTicketStatus)} aria-label="Set status">
              <option value="">Set status…</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          ) : null}
          {caps.delete ? (
            confirmBulk ? (
              <button type="button" className="aw-btn aw-btn--danger" disabled={busy} onClick={() => void bulkDelete()}>Confirm delete {selected.size}</button>
            ) : (
              <button type="button" className="aw-btn aw-btn--danger" onClick={() => setConfirmBulk(true)}>Delete</button>
            )
          ) : null}
          <button type="button" className="aw-btn" onClick={() => { setSelected(new Set()); setConfirmBulk(false); }}>Clear</button>
        </div>
      ) : null}

      {editing ? (
        <TicketEditor
          ticket={editing === "new" ? null : editing}
          defaults={editing === "new" && scopeProject ? { project: scopeProject.id } : undefined}
          projects={projects}
          lanes={lanes}
          canSave={editing === "new" ? caps.create : caps.update}
          canDelete={caps.delete}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === "new") await onCreate?.(input);
            else await onUpdate?.(editing.id, input);
          }}
          onDelete={editing !== "new" && onDelete ? async () => { await onDelete(editing.id); } : undefined}
          onSchedule={editing !== "new" && onSchedule ? async () => { await onSchedule(editing); } : undefined}
        />
      ) : null}
    </div>
  );
}
