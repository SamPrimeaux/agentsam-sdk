import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { fmtNum } from "./format";
import type { ChartSeries, DonutSlice, RangeKey } from "./types";

type IconName =
  | "home"
  | "finance"
  | "health"
  | "users"
  | "bolt"
  | "activity"
  | "filter"
  | "download"
  | "plus"
  | "more"
  | "refresh"
  | "bell"
  | "receipt"
  | "shield"
  | "clock"
  | "sparkles"
  | "flag"
  | "pause";

const ICON_PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 12L12 4l9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  finance: (
    <>
      <path d="M3 17l6-6 4 4 8-9" />
      <path d="M14 6h7v7" />
    </>
  ),
  health: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2" />
      <path d="M21 18c0-2.2-1.8-4-4-4" />
    </>
  ),
  bolt: <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  filter: <path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" />,
  download: (
    <>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 11-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M14 21a2 2 0 01-4 0" />
    </>
  ),
  receipt: (
    <>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  sparkles: <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />,
  flag: <path d="M4 21V4h13l-2 5 2 5H4" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </>
  ),
};

export function Icon({ name, size = 14, stroke = 1.6 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      className="nav-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size }}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Sparkline({
  data,
  width = 88,
  height = 32,
  color = "var(--accent)",
  fill = true,
  stroke = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  stroke?: number;
}) {
  const id = useId().replace(/:/g, "");

  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const fillPath = path + ` L${width} ${height} L0 ${height} Z`;
  const gradientId = `sg-${id}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({
  series,
  height = 220,
  padding = { t: 14, r: 14, b: 24, l: 40 },
  yFormat = (v: number) => fmtNum(v, { compact: true }),
  xLabels,
  showGrid = true,
  showLegend = true,
  stacked = false,
  type = "area",
}: {
  series: ChartSeries[];
  height?: number;
  padding?: { t: number; r: number; b: number; l: number };
  yFormat?: (v: number) => string;
  xLabels?: string[];
  showGrid?: boolean;
  showLegend?: boolean;
  stacked?: boolean;
  type?: "area" | "bar";
}) {
  const chartId = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [w, setW] = useState(800);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const innerW = w - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const n = series[0]?.data.length || 0;
  const stepX = innerW / Math.max(1, n - 1);

  const allValues: number[] = [];
  if (stacked) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const s of series) sum += s.data[i];
      allValues.push(sum);
    }
  } else {
    series.forEach((s) => allValues.push(...s.data));
  }
  const maxY = Math.max(...allValues, 1) * 1.1;
  const minY = 0;
  const yScale = (v: number) => padding.t + innerH - ((v - minY) / (maxY - minY)) * innerH;
  const xScale = (i: number) => padding.l + i * stepX;

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = minY + ((maxY - minY) * i) / gridCount;
    return { y: yScale(v), v };
  });

  const stackedData = useMemo(() => {
    if (!stacked) return series.map((s) => s.data);
    const acc = new Array(n).fill(0);
    return series.map((s) => {
      const top = s.data.map((v, i) => acc[i] + v);
      const bottom = [...acc];
      for (let i = 0; i < n; i++) acc[i] = top[i];
      return { top, bottom };
    });
  }, [series, stacked, n]);

  const onMove = (e: MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.l;
    const i = Math.round(x / stepX);
    if (i >= 0 && i < n) setHover({ i, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="chart-wrap" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} style={{ display: "block" }}>
        {showGrid &&
          gridLines.map((g, i) => (
            <Fragment key={i}>
              <line x1={padding.l} x2={w - padding.r} y1={g.y} y2={g.y} className="grid-line" />
              <text className="axis-label" x={padding.l - 6} y={g.y + 3} textAnchor="end">
                {yFormat(g.v)}
              </text>
            </Fragment>
          ))}
        {xLabels?.map((lbl, i) => {
          if (n > 30 && i % Math.ceil(n / 8) !== 0) return null;
          if (n <= 30 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
          return (
            <text key={i} className="axis-label" x={xScale(i)} y={height - 6} textAnchor="middle">
              {lbl}
            </text>
          );
        })}
        {series.map((s, si) => {
          if (type === "bar") {
            const bw = stepX * 0.6;
            return s.data.map((v, i) => (
              <rect
                key={`${si}-${i}`}
                x={xScale(i) - bw / 2}
                y={yScale(v)}
                width={bw}
                height={yScale(0) - yScale(v)}
                fill={s.color}
                rx="2"
              />
            ));
          }
          let topPath: string;
          let fillPath: string;
          if (stacked && !Array.isArray(stackedData[si])) {
            const sd = stackedData[si] as { top: number[]; bottom: number[] };
            topPath = sd.top.map((v, i) => (i === 0 ? "M" : "L") + xScale(i) + " " + yScale(v)).join(" ");
            fillPath =
              topPath +
              " " +
              sd.bottom
                .map((v, i) => "L" + xScale(n - 1 - i) + " " + yScale(sd.bottom[n - 1 - i]))
                .join(" ") +
              " Z";
          } else {
            topPath = s.data.map((v, i) => (i === 0 ? "M" : "L") + xScale(i) + " " + yScale(v)).join(" ");
            fillPath = topPath + ` L${xScale(n - 1)} ${yScale(0)} L${xScale(0)} ${yScale(0)} Z`;
          }
          return (
            <Fragment key={si}>
              {type === "area" && (
                <>
                  <defs>
                    <linearGradient id={`area-${chartId}-${si}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={stacked ? 0.5 : 0.3} />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={fillPath} fill={`url(#area-${chartId}-${si})`} />
                </>
              )}
              <path d={topPath} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinecap="round" />
            </Fragment>
          );
        })}
        {hover && (
          <>
            <line
              x1={xScale(hover.i)}
              x2={xScale(hover.i)}
              y1={padding.t}
              y2={padding.t + innerH}
              stroke="var(--fg-3)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s, si) => {
              let y: number;
              if (stacked && !Array.isArray(stackedData[si])) {
                y = yScale((stackedData[si] as { top: number[] }).top[hover.i]);
              } else {
                y = yScale(s.data[hover.i]);
              }
              return (
                <circle key={si} cx={xScale(hover.i)} cy={y} r="3.5" fill="var(--bg)" stroke={s.color} strokeWidth="2" />
              );
            })}
          </>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y - 10, position: "fixed" }}>
          <div className="tt-title">{xLabels ? xLabels[hover.i] : `Point ${hover.i + 1}`}</div>
          {series.map((s, si) => (
            <div className="tt-row" key={si}>
              <span className="lbl">
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    background: s.color,
                    borderRadius: 2,
                    marginRight: 6,
                  }}
                />{" "}
                {s.name}
              </span>
              <span className="val">{yFormat(s.data[hover.i])}</span>
            </div>
          ))}
        </div>
      )}
      {showLegend && (
        <div className="legend" style={{ marginTop: 8, paddingLeft: padding.l }}>
          {series.map((s, i) => (
            <span className="legend-item" key={i}>
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Donut({
  data,
  size = 160,
  thickness = 22,
  label,
  sub,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  label: string;
  sub: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const arcs = data.map((d, i) => {
    const start = data.slice(0, i).reduce((sum, item) => sum + item.value / total, 0);
    const frac = d.value / total;
    return { d, i, len: c * frac, offset: c * start };
  });

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={thickness} />
        {arcs.map(({ d, i, len, offset }) => {
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
            {label}
          </div>
          <div className="muted text-xs" style={{ marginTop: 2 }}>
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HBars({
  data,
  max,
  formatter = (v: number) => fmtNum(v, { compact: true }),
  color = "var(--accent)",
}: {
  data: { label: string; value: number; color?: string }[];
  max?: number;
  formatter?: (v: number) => string;
  color?: string;
}) {
  const m = max || Math.max(...data.map((d) => d.value));
  return (
    <div className="col" style={{ gap: 8 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <span className="text-xs" style={{ color: "var(--fg-1)" }}>
              {d.label}
            </span>
            <span className="text-xs mono muted">{formatter(d.value)}</span>
          </div>
          <div className="progress">
            <div style={{ width: `${(d.value / m) * 100}%`, background: d.color || color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function KPI({
  label,
  value,
  unit,
  delta,
  deltaLabel = "vs prev",
  spark,
  sparkColor = "var(--accent)",
  icon,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  spark?: number[];
  sparkColor?: string;
  icon?: IconName;
  onClick?: () => void;
}) {
  const dir = delta == null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <div className="kpi" onClick={onClick}>
      <div className="kpi-label">
        {icon && <Icon name={icon} size={11} />}
        {label}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="kpi-meta">
        {delta != null && (
          <span className={`kpi-delta ${dir}`}>
            {dir === "up" ? "▲" : dir === "down" ? "▼" : "–"}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        <span>{deltaLabel}</span>
      </div>
      {spark && (
        <div className="kpi-spark">
          <Sparkline data={spark} color={sparkColor} />
        </div>
      )}
    </div>
  );
}

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: RangeKey[] = ["24h", "7d", "30d", "90d", "YTD", "All"];
  return (
    <div className="range-pill">
      {opts.map((o) => (
        <button key={o} type="button" className={value === o ? "active" : ""} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
