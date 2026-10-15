import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkCalendarEvent, WorkCapabilities, WorkNavigate, WorkProject, WorkTicket } from "../../contracts/index";
import type { WorkActions } from "../actions";
import { EventEditor } from "../EventEditor";
import { ErrorLine, addDays, sameDay, startOfDay, startOfMonth, startOfWeek, useAction } from "../shared";
import { isOpen } from "../ticket-plan";

type View = "day" | "week" | "month";
const HOUR = 52;
const SNAP = 30;
const MIN = 60_000;

type Placed = { event: WorkCalendarEvent; ticket?: WorkTicket; top: number; height: number; lane: number; lanes: number };
type Draft = { start: string; end: string; projectId?: string | null };

const colorOf = (e: WorkCalendarEvent) => e.color || "var(--agentsam-work-accent)";

const hourLabel = (h: number) => (h === 0 ? "" : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" }));

function layoutDay(day: Date, events: Array<{ event: WorkCalendarEvent; ticket?: WorkTicket }>): Placed[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 24 * 60 * MIN;
  const items = events
    .filter(({ event }) => !event.allDay && Date.parse(event.start) < dayEnd && Date.parse(event.end) > dayStart)
    .map(({ event, ticket }) => {
      const s = Math.max(Date.parse(event.start), dayStart);
      const e = Math.min(Math.max(Date.parse(event.end), s + 15 * MIN), dayEnd);
      return { event, ticket, s, e };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const laneEnds: number[] = [];
  const placed = items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.s);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.e;
    return { ...item, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({
    event: p.event,
    ticket: p.ticket,
    top: ((p.s - dayStart) / MIN / 60) * HOUR,
    height: Math.max(18, ((p.e - p.s) / MIN / 60) * HOUR - 2),
    lane: p.lane,
    lanes,
  }));
}

export function CalendarSurface({
  events,
  tickets = [],
  projects = [],
  capabilities,
  actions = {},
  onRangeChange,
  onOpenTicket,
  onNavigate,
}: {
  events: WorkCalendarEvent[];
  tickets?: WorkTicket[];
  projects?: WorkProject[];
  capabilities?: WorkCapabilities["calendar"];
  actions?: WorkActions;
  /** Called with the visible window so the host can load events for it. */
  onRangeChange?: (from: string, to: string) => void;
  onOpenTicket?: (ticket: WorkTicket) => void;
  onNavigate?: WorkNavigate;
}) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<{ event: WorkCalendarEvent | null; draft?: Draft } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sel, setSel] = useState<{ col: number; a: number; b: number } | null>(null);
  const [moving, setMoving] = useState<{ id: string; col: number; min: number } | null>(null);
  const colRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { busy, error, run } = useAction();
  const caps = capabilities ?? { create: Boolean(actions.createEvent), update: Boolean(actions.updateEvent), delete: Boolean(actions.deleteEvent) };

  const days = useMemo(() => {
    if (view === "day") return [startOfDay(anchor)];
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }, [view, anchor]);

  const range = useMemo(() => {
    if (view === "month") {
      const from = startOfWeek(startOfMonth(anchor));
      return { from, to: addDays(from, 42) };
    }
    return { from: days[0], to: addDays(days[days.length - 1], 1) };
  }, [view, anchor, days]);

  useEffect(() => {
    onRangeChange?.(range.from.toISOString(), range.to.toISOString());
  }, [range.from.getTime(), range.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (scrollRef.current && view !== "month") scrollRef.current.scrollTop = 7 * HOUR - 8;
  }, [view]);

  // Open tickets with a due date appear on the calendar next to events (one workspace).
  const merged = useMemo(() => {
    const own = events.map((event) => ({ event }));
    const due = tickets
      .filter((t) => t.dueAt && isOpen(t))
      .map((ticket) => {
        const end = Date.parse(ticket.dueAt as string);
        const event: WorkCalendarEvent = {
          id: `ticket:${ticket.id}`,
          title: ticket.title,
          type: "task",
          start: new Date(end - 30 * MIN).toISOString(),
          end: new Date(end).toISOString(),
          readOnly: true,
          source: "ticket",
          color: "var(--agentsam-work-warning)",
        };
        return { event, ticket };
      })
      .filter(({ event }) => Date.parse(event.end) >= range.from.getTime() && Date.parse(event.start) < range.to.getTime());
    return [...own, ...due];
  }, [events, tickets, range.from, range.to]);

  const title =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "day"
        ? anchor.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
        : `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const step = (dir: -1 | 1) =>
    setAnchor((a) => (view === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * (view === "week" ? 7 : 1))));

  const openNew = (start: Date, end: Date) => {
    if (!caps.create || !actions.createEvent) return;
    setEditing({ event: null, draft: { start: start.toISOString(), end: end.toISOString() } });
  };

  const openEvent = (item: { event: WorkCalendarEvent; ticket?: WorkTicket }) => {
    if (item.ticket) onOpenTicket?.(item.ticket);
    else setEditing({ event: item.event });
  };

  const minutesAt = (col: number, clientY: number) => {
    const el = colRefs.current[col];
    if (!el) return 0;
    const y = clientY - el.getBoundingClientRect().top;
    return Math.max(0, Math.min(24 * 60 - SNAP, Math.floor(((y / HOUR) * 60) / SNAP) * SNAP));
  };
  const colAt = (clientX: number) => {
    const index = colRefs.current.findIndex((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return clientX >= r.left && clientX < r.right;
    });
    return index;
  };

  const onGridDown = (col: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!caps.create || e.button !== 0 || (e.target as HTMLElement).closest("[data-event]")) return;
    const m = minutesAt(col, e.clientY);
    setSel({ col, a: m, b: m });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGridMove = (col: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (sel && sel.col === col) setSel({ ...sel, b: minutesAt(col, e.clientY) });
  };
  const onGridUp = (col: number) => {
    if (!sel || sel.col !== col) return;
    const lo = Math.min(sel.a, sel.b);
    const hi = Math.max(sel.a, sel.b) + SNAP;
    const day = days[col];
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, lo);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, Math.max(hi, lo + 60 > hi && sel.a === sel.b ? lo + 60 : hi));
    setSel(null);
    openNew(start, end);
  };

  const startMove = (item: { event: WorkCalendarEvent; ticket?: WorkTicket }, col: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (item.ticket || item.event.readOnly || !caps.update || e.button !== 0) return;
    const origin = { x: e.clientX, y: e.clientY };
    const duration = Date.parse(item.event.end) - Date.parse(item.event.start);
    const startDate = new Date(item.event.start);
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    let moved = false;
    let last = { col, min: startMinutes };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
      moved = true;
      const c = colAt(ev.clientX);
      const targetCol = c === -1 ? last.col : c;
      const delta = Math.round((((ev.clientY - origin.y) / HOUR) * 60) / SNAP) * SNAP;
      const min = Math.max(0, Math.min(24 * 60 - SNAP, startMinutes + delta));
      last = { col: targetCol, min };
      setMoving({ id: item.event.id, ...last });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMoving(null);
      if (!moved) return setEditing({ event: item.event });
      const day = days[last.col];
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, last.min);
      void run(async () => {
        await actions.updateEvent?.(item.event.id, { start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString() });
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const monthCells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(range.from, i)), [range.from]);
  const eventsOn = (day: Date) =>
    merged
      .filter(({ event }) => Date.parse(event.start) < addDays(day, 1).getTime() && Date.parse(event.end) > day.getTime())
      .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));

  return (
    <div className="aw-cal">
      <div className="aw-cal__bar">
        <button type="button" className="aw-btn" onClick={() => setAnchor(new Date())}>Today</button>
        <button type="button" className="aw-icon-btn" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
        <button type="button" className="aw-icon-btn" aria-label="Next" onClick={() => step(1)}><ChevronRight size={16} /></button>
        <h2>{title}</h2>
        <span style={{ flex: 1 }} />
        <select className="aw-select" style={{ width: "auto" }} value={view} onChange={(e) => setView(e.target.value as View)} aria-label="Calendar view">
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        {actions.refresh ? (
          <button type="button" className="aw-icon-btn" aria-label="Refresh" disabled={busy} onClick={() => void run(async () => { await actions.refresh?.(); })}><RefreshCw size={14} /></button>
        ) : null}
        {caps.create && actions.createEvent ? (
          <button type="button" className="aw-btn aw-btn--primary" onClick={() => { const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); openNew(s, new Date(s.getTime() + 60 * MIN)); }}>+ Create</button>
        ) : null}
      </div>
      {error ? <div style={{ padding: "8px 16px 0" }}><ErrorLine message={error} /></div> : null}

      <div className="aw-cal__scroll" ref={scrollRef}>
        {view === "month" ? (
          <div className="aw-month">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="aw-month__dow">{d}</div>)}
            {monthCells.map((day) => {
              const list = eventsOn(day);
              return (
                <div
                  key={day.toISOString()}
                  className="aw-month__cell"
                  data-out={day.getMonth() !== anchor.getMonth()}
                  data-today={sameDay(day, new Date(now))}
                  onClick={() => openNew(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10))}
                >
                  <b>{day.getDate()}</b>
                  {list.slice(0, 3).map((item) => (
                    <span key={item.event.id} className="aw-chip" style={{ ["--aw-color" as string]: colorOf(item.event) }} onClick={(e) => { e.stopPropagation(); openEvent(item); }} title={item.event.title}>
                      {item.event.title}
                    </span>
                  ))}
                  {list.length > 3 ? (
                    <span className="aw-chip" style={{ background: "transparent", color: "var(--agentsam-work-muted)" }} onClick={(e) => { e.stopPropagation(); setAnchor(day); setView("day"); }}>+{list.length - 3} more</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="aw-week" style={{ ["--aw-days" as string]: days.length, ["--aw-hour" as string]: `${HOUR}px` }}>
            <div className="aw-week__head">
              <div />
              {days.map((d) => {
                const allDay = merged.filter(({ event }) => event.allDay && Date.parse(event.start) < addDays(d, 1).getTime() && Date.parse(event.end) > d.getTime());
                return (
                  <div key={d.toISOString()} data-today={sameDay(d, new Date(now))}>
                    {d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
                    <b>{d.getDate()}</b>
                    {allDay.map((item) => (
                      <span key={item.event.id} className="aw-chip" style={{ ["--aw-color" as string]: colorOf(item.event) }} onClick={() => openEvent(item)}>{item.event.title}</span>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="aw-gutter">
              {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{hourLabel(h)}</span>)}
            </div>
            {days.map((day, col) => {
              const placed = layoutDay(day, merged);
              const isToday = sameDay(day, new Date(now));
              return (
                <div
                  key={day.toISOString()}
                  className="aw-daycol"
                  data-today={isToday}
                  ref={(el) => { colRefs.current[col] = el; }}
                  onPointerDown={(e) => onGridDown(col, e)}
                  onPointerMove={(e) => onGridMove(col, e)}
                  onPointerUp={() => onGridUp(col)}
                >
                  {placed.map((p) => {
                    const isMoving = moving?.id === p.event.id;
                    if (isMoving && moving.col !== col) return null;
                    const top = isMoving ? (moving.min / 60) * HOUR : p.top;
                    return (
                      <div
                        key={p.event.id}
                        data-event
                        data-readonly={Boolean(p.event.readOnly || p.ticket)}
                        data-ticket={Boolean(p.ticket)}
                        className="aw-event"
                        style={{ top, height: p.height, left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 8px)`, right: "auto", ["--aw-color" as string]: colorOf(p.event), opacity: isMoving ? 0.7 : undefined }}
                        onPointerDown={(e) => startMove(p, col, e)}
                        onClick={(e) => { e.stopPropagation(); if (p.event.readOnly || p.ticket || !caps.update) openEvent(p); }}
                        title={p.event.title}
                      >
                        <b>{p.event.title}</b>
                        {p.height > 34 ? <small>{new Date(p.event.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small> : null}
                      </div>
                    );
                  })}
                  {moving && moving.col === col && !placed.some((p) => p.event.id === moving.id) ? (
                    <div className="aw-event" style={{ top: (moving.min / 60) * HOUR, height: HOUR - 2, opacity: 0.7 }}><b>Moving…</b></div>
                  ) : null}
                  {sel && sel.col === col ? (
                    <div className="aw-draft" style={{ top: (Math.min(sel.a, sel.b) / 60) * HOUR, height: ((Math.abs(sel.b - sel.a) + SNAP) / 60) * HOUR }} />
                  ) : null}
                  {isToday ? <div className="aw-nowline" style={{ top: ((new Date(now).getHours() * 60 + new Date(now).getMinutes()) / 60) * HOUR }} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing ? (
        <EventEditor
          event={editing.event}
          draft={editing.draft}
          projects={projects}
          canSave={editing.event ? caps.update : caps.create}
          canDelete={caps.delete}
          onClose={() => setEditing(null)}
          onOpenProject={onNavigate ? (id) => onNavigate("/projects/" + encodeURIComponent(id)) : undefined}
          onSave={async (input) => {
            if (editing.event) await actions.updateEvent?.(editing.event.id, input);
            else await actions.createEvent?.(input);
          }}
          onDelete={editing.event && actions.deleteEvent ? async () => { await actions.deleteEvent?.(editing.event!.id); } : undefined}
        />
      ) : null}
    </div>
  );
}
