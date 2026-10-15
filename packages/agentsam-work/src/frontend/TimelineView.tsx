import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pill } from "./shared";

export type TimelineItem = {
  id: string;
  title: string;
  /** ISO-8601 */
  start: string;
  end: string;
  progress?: number;
  color?: string;
  meta?: string;
};

const DAY = 86_400_000;
const MAX_ROWS = 150;
type Zoom = "fit" | "day" | "week";

const floorDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Gantt-style timeline sized from its own container (ResizeObserver), never from the viewport:
 * "Fit" stretches the date range to the available width, Day/Week use fixed density and scroll
 * inside the component. The label column narrows on small containers.
 */
export function TimelineView({
  items,
  onSelect,
  undatedCount = 0,
}: {
  items: TimelineItem[];
  onSelect?: (id: string) => void;
  undatedCount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("fit");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(
    () =>
      items
        .map((item) => ({ ...item, s: Date.parse(item.start), e: Date.parse(item.end) }))
        .filter((item) => Number.isFinite(item.s) && Number.isFinite(item.e))
        .sort((a, b) => a.s - b.s)
        .slice(0, MAX_ROWS),
    [items],
  );

  const model = useMemo(() => {
    if (!rows.length || !width) return null;
    const now = Date.now();
    const min = Math.min(...rows.map((r) => r.s), now);
    const max = Math.max(...rows.map((r) => Math.max(r.e, r.s + DAY)), now);
    const start = floorDay(min) - 2 * DAY;
    const days = Math.max(14, Math.ceil((floorDay(max) + 4 * DAY - start) / DAY));
    const label = width < 560 ? 132 : width < 860 ? 184 : 240;
    const pane = Math.max(120, width - label - 2);
    const minDay = width < 560 ? 22 : 28;
    const dayW = zoom === "day" ? 48 : zoom === "week" ? 16 : Math.max(minDay, pane / days);
    return { start, days, label, dayW: Math.round(dayW * 100) / 100, track: Math.round(dayW * days), now };
  }, [rows, width, zoom]);

  if (!rows.length) {
    return (
      <div className="aw-tl" ref={ref}>
        <div className="aw-empty">
          <strong>Nothing to schedule yet</strong>
          <span>Give tickets a start or due date and they appear here.{undatedCount ? ` ${undatedCount} without dates.` : ""}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="aw-tl" ref={ref}>
      <div className="aw-tl__bar">
        <div role="group" aria-label="Zoom" style={{ display: "flex", gap: 4 }}>
          {(["fit", "week", "day"] as Zoom[]).map((value) => (
            <button key={value} type="button" className="aw-btn" data-active={zoom === value} aria-pressed={zoom === value} onClick={() => setZoom(value)} style={zoom === value ? { borderColor: "var(--agentsam-work-accent)" } : undefined}>
              {value === "fit" ? "Fit" : value === "week" ? "Week" : "Day"}
            </button>
          ))}
        </div>
        <span>{rows.length} scheduled{undatedCount ? ` · ${undatedCount} without dates` : ""}</span>
      </div>
      {model ? (
        <div className="aw-tl__scroll">
          <div className="aw-tl__grid" style={{ ["--aw-label" as string]: `${model.label}px`, ["--aw-track" as string]: `${model.track}px` }}>
            <div className="aw-tl__corner">Work item</div>
            <div className="aw-tl__days" style={{ gridTemplateColumns: `repeat(${model.days}, ${model.dayW}px)` }}>
              {Array.from({ length: model.days }, (_, i) => {
                const d = new Date(model.start + i * DAY);
                const first = d.getDate() === 1 || i === 0;
                return (
                  <div className="aw-tl__day" key={i}>
                    {first ? <strong>{d.toLocaleString(undefined, { month: "short" })}</strong> : null}
                    {model.dayW >= 22 ? <span>{d.getDate()}</span> : null}
                  </div>
                );
              })}
            </div>
            {rows.map((row) => {
              const left = ((row.s - model.start) / DAY) * model.dayW;
              const width = Math.max(6, (Math.max(row.e, row.s + DAY) - row.s) / DAY * model.dayW);
              const color = row.color ? { ["--aw-color" as string]: row.color } : undefined;
              return (
                <RowPair key={row.id} onSelect={onSelect} id={row.id} title={row.title} meta={row.meta}>
                  <div className="aw-tl__bar-item" style={{ left, width, ...color }} title={`${row.title}${row.meta ? ` · ${row.meta}` : ""}`}>
                    <i style={{ width: `${Math.max(0, Math.min(100, row.progress ?? 0))}%` }} />
                    <span>{width > 48 ? row.title : ""}</span>
                  </div>
                </RowPair>
              );
            })}
            <div className="aw-tl__today" style={{ left: model.label + ((model.now - model.start) / DAY) * model.dayW }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowPair({
  id,
  title,
  meta,
  onSelect,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  onSelect?: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="aw-tl__label" onClick={() => onSelect?.(id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect?.(id)}>
        <span>{title}</span>
        {meta ? <Pill>{meta}</Pill> : null}
      </div>
      <div className="aw-tl__lane" onClick={() => onSelect?.(id)}>
        {children}
      </div>
    </>
  );
}
