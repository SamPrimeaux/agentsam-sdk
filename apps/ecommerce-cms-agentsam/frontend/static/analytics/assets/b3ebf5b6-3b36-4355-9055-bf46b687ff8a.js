// Shared utilities and small components
const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;

// ---------- Number / format helpers ----------
const fmtNum = (n, opts = {}) => {
  const { compact = false, decimals = 0, prefix = '', suffix = '' } = opts;
  if (n == null || isNaN(n)) return '–';
  let s;
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) s = (n / 1e9).toFixed(2) + 'B';
    else if (abs >= 1e6) s = (n / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e3) s = (n / 1e3).toFixed(1) + 'K';
    else s = n.toFixed(decimals);
  } else {
    s = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return prefix + s + suffix;
};
const fmtPct = (n, decimals = 1) => (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%';
const fmtBytes = (b) => {
  if (b < 1024) return b + ' B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + ' MB';
  if (b < 1024 ** 4) return (b / 1024 ** 3).toFixed(2) + ' GB';
  return (b / 1024 ** 4).toFixed(2) + ' TB';
};
const fmtMs = (ms) => ms < 1 ? (ms * 1000).toFixed(0) + 'µs' : ms < 1000 ? ms.toFixed(0) + 'ms' : (ms / 1000).toFixed(2) + 's';

// ---------- Seeded random for stable mock data ----------
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const seedRand = (seed) => mulberry32(seed);

// Generate time-series with trend + noise + seasonality
function genSeries(n, { seed = 1, base = 100, trend = 0.5, noise = 0.1, season = 0 } = {}) {
  const r = seedRand(seed);
  const arr = [];
  for (let i = 0; i < n; i++) {
    const seasonal = season ? Math.sin((i / n) * Math.PI * 4) * season * base : 0;
    const noiseV = (r() - 0.5) * 2 * noise * base;
    const trendV = (i / n) * trend * base;
    arr.push(Math.max(0, base + trendV + seasonal + noiseV));
  }
  return arr;
}

// ---------- Icon component ----------
function Icon({ name, size = 14, stroke = 1.6 }) {
  const paths = {
    home: <><path d="M3 12L12 4l9 8" /><path d="M5 10v10h14V10" /></>,
    finance: <><path d="M3 17l6-6 4 4 8-9" /><path d="M14 6h7v7" /></>,
    health: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2" /><path d="M21 18c0-2.2-1.8-4-4-4" /></>,
    db: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    cloud: <><path d="M7 18a5 5 0 010-10 7 7 0 0113-1 4 4 0 011 8H7z" /></>,
    bolt: <><path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.4 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.4-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.4H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
    bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M14 21a2 2 0 01-4 0" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.4-4.4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
    filter: <><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" /></>,
    refresh: <><path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
    arrowUp: <><path d="M7 14l5-5 5 5" /></>,
    arrowDown: <><path d="M7 10l5 5 5-5" /></>,
    arrowRight: <><path d="M5 12h14M13 5l7 7-7 7" /></>,
    chevronDown: <><path d="M6 9l6 6 6-6" /></>,
    chevronUp: <><path d="M18 15l-6-6-6 6" /></>,
    check: <><path d="M20 6L9 17l-5-5" /></>,
    x: <><path d="M18 6L6 18M6 6l12 12" /></>,
    more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
    flag: <><path d="M4 21V4h13l-2 5 2 5H4" /></>,
    api: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
    receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>,
    code: <><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></>,
    server: <><rect x="2" y="3" width="20" height="7" rx="1" /><rect x="2" y="14" width="20" height="7" rx="1" /><circle cx="6" cy="6.5" r="0.5" fill="currentColor" /><circle cx="6" cy="17.5" r="0.5" fill="currentColor" /></>,
    sparkles: <><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" /></>,
    layers: <><path d="M12 2l10 5-10 5L2 7l10-5z" /><path d="M2 12l10 5 10-5M2 17l10 5 10-5" /></>,
    book: <><path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5z" /><path d="M4 19a2 2 0 012-2h13" /></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-7H5.5z" /></>,
    play: <><polygon points="5 3 19 12 5 21 5 3" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return (
    <svg className="nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
      {paths[name] || null}
    </svg>
  );
}

// ---------- Sparkline ----------
function Sparkline({ data, width = 88, height = 32, color = 'var(--accent)', fill = true, stroke = 1.5 }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const fillPath = path + ` L${width} ${height} L0 ${height} Z`;
  const id = useMemo(() => 'sg-' + Math.random().toString(36).slice(2, 7), []);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#${id})`} />
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Tooltip portal ----------
function useTooltip() {
  const [tt, setTt] = useState(null);
  const show = (e, content) => {
    setTt({ x: e.clientX + 12, y: e.clientY + 12, content });
  };
  const hide = () => setTt(null);
  const node = tt && (
    <div className="tooltip" style={{ left: tt.x, top: tt.y }}>{tt.content}</div>
  );
  return { show, hide, node };
}

// ---------- Area chart ----------
function AreaChart({ series, height = 220, padding = { t: 14, r: 14, b: 24, l: 40 }, yFormat = (v) => fmtNum(v, { compact: true }), xLabels, showGrid = true, showLegend = true, stacked = false, type = 'area' }) {
  const ref = useRef();
  const [hover, setHover] = useState(null);
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

  let allValues = [];
  if (stacked) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const s of series) sum += s.data[i];
      allValues.push(sum);
    }
  } else {
    series.forEach(s => allValues.push(...s.data));
  }
  const maxY = Math.max(...allValues, 1) * 1.1;
  const minY = 0;
  const yScale = (v) => padding.t + innerH - ((v - minY) / (maxY - minY)) * innerH;
  const xScale = (i) => padding.l + i * stepX;

  // grid lines
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = minY + ((maxY - minY) * i) / gridCount;
    return { y: yScale(v), v };
  });

  // build paths
  const stackedData = useMemo(() => {
    if (!stacked) return series.map(s => s.data);
    const acc = new Array(n).fill(0);
    return series.map(s => {
      const top = s.data.map((v, i) => acc[i] + v);
      const bottom = [...acc];
      for (let i = 0; i < n; i++) acc[i] = top[i];
      return { top, bottom };
    });
  }, [series, stacked, n]);

  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.l;
    const i = Math.round(x / stepX);
    if (i >= 0 && i < n) setHover({ i, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="chart-wrap" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} style={{ display: 'block' }}>
        {showGrid && gridLines.map((g, i) => (
          <Fragment key={i}>
            <line x1={padding.l} x2={w - padding.r} y1={g.y} y2={g.y} className="grid-line" />
            <text className="axis-label" x={padding.l - 6} y={g.y + 3} textAnchor="end">{yFormat(g.v)}</text>
          </Fragment>
        ))}
        {/* x labels */}
        {xLabels && xLabels.map((lbl, i) => {
          if (n > 30 && i % Math.ceil(n / 8) !== 0) return null;
          if (n <= 30 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
          return <text key={i} className="axis-label" x={xScale(i)} y={height - 6} textAnchor="middle">{lbl}</text>;
        })}

        {series.map((s, si) => {
          if (type === 'bar') {
            const bw = stepX * 0.6;
            return s.data.map((v, i) => (
              <rect key={i} x={xScale(i) - bw / 2} y={yScale(v)} width={bw} height={yScale(0) - yScale(v)} fill={s.color} rx="2" />
            ));
          }
          let topPath, fillPath;
          if (stacked) {
            const { top, bottom } = stackedData[si];
            topPath = top.map((v, i) => (i === 0 ? 'M' : 'L') + xScale(i) + ' ' + yScale(v)).join(' ');
            fillPath = topPath + ' ' + bottom.map((v, i) => 'L' + xScale(n - 1 - i) + ' ' + yScale(bottom[n - 1 - i])).join(' ') + ' Z';
          } else {
            topPath = s.data.map((v, i) => (i === 0 ? 'M' : 'L') + xScale(i) + ' ' + yScale(v)).join(' ');
            fillPath = topPath + ` L${xScale(n - 1)} ${yScale(0)} L${xScale(0)} ${yScale(0)} Z`;
          }
          const id = `area-${si}-${Math.random().toString(36).slice(2, 6)}`;
          return (
            <Fragment key={si}>
              {(type === 'area') && (
                <>
                  <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={stacked ? 0.5 : 0.3} />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={fillPath} fill={`url(#${id})`} />
                </>
              )}
              <path d={topPath} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinecap="round" />
            </Fragment>
          );
        })}

        {/* Hover line + dots */}
        {hover && (
          <>
            <line x1={xScale(hover.i)} x2={xScale(hover.i)} y1={padding.t} y2={padding.t + innerH} stroke="var(--fg-3)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s, si) => {
              let y;
              if (stacked) y = yScale(stackedData[si].top[hover.i]);
              else y = yScale(s.data[hover.i]);
              return <circle key={si} cx={xScale(hover.i)} cy={y} r="3.5" fill="var(--bg)" stroke={s.color} strokeWidth="2" />;
            })}
          </>
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y - 10, position: 'fixed' }}>
          <div className="tt-title">{xLabels ? xLabels[hover.i] : `Point ${hover.i + 1}`}</div>
          {series.map((s, si) => (
            <div className="tt-row" key={si}>
              <span className="lbl"><span style={{ display: 'inline-block', width: 8, height: 8, background: s.color, borderRadius: 2, marginRight: 6 }} />{s.name}</span>
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

// ---------- Donut chart ----------
function Donut({ data, size = 160, thickness = 22, label, sub }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const len = c * frac;
          const offset = c * acc;
          acc += frac;
          return (
            <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
              stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{label}</div>
          <div className="muted text-xs" style={{ marginTop: 2 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Bar chart (horizontal) ----------
function HBars({ data, max, formatter = (v) => fmtNum(v, { compact: true }), color = 'var(--accent)' }) {
  const m = max || Math.max(...data.map(d => d.value));
  return (
    <div className="col" style={{ gap: 8 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <span className="text-xs" style={{ color: 'var(--fg-1)' }}>{d.label}</span>
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

// ---------- KPI tile ----------
function KPI({ label, value, unit, delta, deltaLabel = 'vs prev', spark, sparkColor = 'var(--accent)', icon, onClick }) {
  const dir = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="kpi" onClick={onClick}>
      <div className="kpi-label">
        {icon && <Icon name={icon} size={11} />}
        {label}
      </div>
      <div className="kpi-value">
        {value}{unit && <span className="unit">{unit}</span>}
      </div>
      <div className="kpi-meta">
        {delta != null && (
          <span className={`kpi-delta ${dir}`}>
            {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        <span>{deltaLabel}</span>
      </div>
      {spark && <div className="kpi-spark"><Sparkline data={spark} color={sparkColor} /></div>}
    </div>
  );
}

// ---------- Range picker ----------
function RangePicker({ value, onChange }) {
  const opts = ['24h', '7d', '30d', '90d', 'YTD', 'All'];
  return (
    <div className="range-pill">
      {opts.map(o => (
        <button key={o} className={value === o ? 'active' : ''} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

// expose globally for other scripts
Object.assign(window, {
  fmtNum, fmtPct, fmtBytes, fmtMs, seedRand, genSeries,
  Icon, Sparkline, AreaChart, Donut, HBars, KPI, RangePicker, useTooltip,
});
