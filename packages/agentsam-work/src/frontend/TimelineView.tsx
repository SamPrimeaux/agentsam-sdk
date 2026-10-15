import { useLayoutEffect, useMemo, useRef, useState } from "react";

export type TimelineItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  progress?: number;
  color?: string;
  meta?: string;
  status?: string;
  provenance?: "scheduled" | "activity";
};

const DAY = 86_400_000;
const MAX_ROWS = 80;
type Zoom = "fit" | "month" | "week";
type Lane = "scheduled" | "activity";
const atDay = (ms: number) => Math.floor(ms / DAY) * DAY;
const pretty = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/** Planned dates and observed history are never presented as the same kind of work. */
export function TimelineView({
  items,
  activityItems = [],
  onSelect,
  undatedCount = 0,
}: {
  items: TimelineItem[];
  activityItems?: TimelineItem[];
  onSelect?: (id: string) => void;
  undatedCount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [lane, setLane] = useState<Lane>(() => activityItems.length > items.length * 3 ? "activity" : "scheduled");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [limit, setLimit] = useState(MAX_ROWS);
  const [now] = useState(() => Date.now());

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const source = lane === "scheduled" ? items : activityItems;
  const allRows = useMemo(() => source
    .map(item => ({ ...item, s: Date.parse(item.start), e: Date.parse(item.end) }))
    .filter(item => Number.isFinite(item.s) && Number.isFinite(item.e) && (!hideCompleted || item.status !== "shipped"))
    .sort((a, b) => lane === "activity" ? b.e - a.e : a.s - b.s), [source, hideCompleted, lane]);
  const rows = useMemo(() => allRows.slice(0, limit), [allRows, limit]);

  const model = useMemo(() => {
    if (!rows.length || !width) return null;
    const earliest = Math.min(...rows.map(r => r.s));
    const latest = Math.max(...rows.map(r => Math.max(r.s + DAY, r.e)));
    const label = width < 520 ? 142 : width < 850 ? 190 : 276;
    const pane = Math.max(100, width - label - 2);
    let start = atDay(earliest) - DAY;
    let days = Math.max(7, Math.ceil((atDay(latest) + 2 * DAY - start) / DAY));
    if (zoom !== "fit") {
      days = zoom === "week" ? 14 : 42;
      start = atDay(now) - (zoom === "week" ? 3 : 10) * DAY;
    }
    const dayW = zoom === "fit" ? pane / days : zoom === "week" ? Math.max(42, pane / 14) : Math.max(24, pane / 42);
    const track = Math.ceil(days * dayW);
    const step = dayW >= 36 ? 1 : dayW >= 16 ? 3 : dayW >= 8 ? 7 : 14;
    return { start, days, dayW, label, track, step, now };
  }, [rows, width, zoom, now]);

  return <section className="aw-tl" ref={ref} aria-label="Ticket timeline">
    <div className="aw-tl__top">
      <div className="aw-tl__mode" role="group" aria-label="Timeline data">
        <button type="button" data-active={lane === "scheduled"} aria-pressed={lane === "scheduled"} onClick={() => { setLane("scheduled"); setLimit(MAX_ROWS); }}>Planned <span>{items.length}</span></button>
        <button type="button" data-active={lane === "activity"} aria-pressed={lane === "activity"} onClick={() => { setLane("activity"); setLimit(MAX_ROWS); }}>Activity <span>{activityItems.length}</span></button>
      </div>
      <div className="aw-tl__tools">
        <label className="aw-tl__hide"><input type="checkbox" checked={hideCompleted} onChange={e => { setHideCompleted(e.target.checked); setLimit(MAX_ROWS); }} /> Hide shipped</label>
        <div className="aw-tl__zoom" role="group" aria-label="Timeline zoom">
          {(["fit", "month", "week"] as Zoom[]).map(z => <button type="button" key={z} data-active={zoom === z} aria-pressed={zoom === z} onClick={() => setZoom(z)}>{z === "fit" ? "Fit" : z === "month" ? "6 weeks" : "2 weeks"}</button>)}
        </div>
      </div>
    </div>
    <div className="aw-tl__context">
      <span>{lane === "activity" ? "Observed changes, not planned dates" : "Only user-scheduled dates"}</span>
      <span>{rows.length ? rows.length + " visible" + (allRows.length > limit ? " of " + allRows.length : "") : "No items"}
        {lane === "scheduled" && undatedCount ? " · " + undatedCount + " without schedule" : ""}
      </span>
    </div>
    {!rows.length ? <div className="aw-empty">
      <strong>{lane === "scheduled" ? "No scheduled items match this view" : "No activity dates available"}</strong>
      <span>{lane === "scheduled" ? "Add start/due dates to create a plan, or switch to Activity to inspect existing ticket history." : "Created and updated timestamps will appear here without inventing deadlines."}</span>
    </div> : model ? <div className="aw-tl__scroll" tabIndex={0} aria-label="Scrollable timeline grid">
      <div className="aw-tl__grid" style={{ ["--aw-label" as string]: model.label + "px", ["--aw-track" as string]: model.track + "px" }}>
        <div className="aw-tl__corner">Work item</div>
        <div className="aw-tl__days" style={{ gridTemplateColumns: "repeat(" + model.days + ", " + model.dayW + "px)" }}>
          {Array.from({ length: model.days }, (_, i) => {
            const time = model.start + i * DAY;
            return <div className="aw-tl__day" key={time} data-today={atDay(now) === time || undefined}>
              {i % model.step === 0 ? <span>{pretty(time)}</span> : null}
            </div>;
          })}
        </div>
        {rows.map(row => {
          const left = (row.s - model.start) / DAY * model.dayW;
          const barWidth = Math.max(7, (Math.max(row.e, row.s + DAY) - row.s) / DAY * model.dayW);
          const start = clamp(left, 0, model.track);
          const end = clamp(left + barWidth, 0, model.track);
          const color = row.color ? { ["--aw-color" as string]: row.color } : undefined;
          return <div className="aw-tl__pair" key={row.id}>
            <button className="aw-tl__label" title={row.title} type="button" onClick={() => onSelect?.(row.id)}>
              <span className="aw-tl__status" data-status={row.status || "backlog"} />
              <span className="aw-tl__label-text">{row.title}</span>
              {row.progress != null && row.progress > 0 ? <small>{Math.round(row.progress)}%</small> : row.meta ? <small>{row.meta}</small> : null}
            </button>
            <div className="aw-tl__lane">
              {end > start ? <button
                type="button"
                className="aw-tl__bar-item"
                title={row.title + " · " + pretty(row.s) + " – " + pretty(row.e) + (lane === "activity" ? " · observed activity" : "")}
                data-status={row.status}
                data-provenance={lane}
                onClick={() => onSelect?.(row.id)}
                style={{ left: start, width: Math.max(7, end - start), ...color }}
              >
                <i style={{ width: clamp(row.progress ?? 0, 0, 100) + "%" }} />
                <span>{barWidth > 110 && lane === "scheduled" ? row.title : ""}</span>
              </button> : null}
            </div>
          </div>;
        })}
        {model.now >= model.start && model.now <= model.start + model.days * DAY ? <div className="aw-tl__today" style={{ left: model.label + (model.now - model.start) / DAY * model.dayW }}><span>Today</span></div> : null}
      </div>
    </div> : null}
    {allRows.length > limit ? <button type="button" className="aw-tl__loadmore" onClick={() => setLimit(current => current + MAX_ROWS)}>
      Show next {Math.min(MAX_ROWS, allRows.length - limit)} items · {allRows.length - limit} remaining
    </button> : null}
  </section>;
}
