// Health / Infrastructure Dashboard
function HealthPage({ range, tenant }) {
  const seed = 88;
  const days = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === 'YTD' ? 124 : 365;
  const xLabels = useMemo(() => {
    const arr = [];
    if (range === '24h') {
      for (let i = 0; i < 24; i++) arr.push(`${i.toString().padStart(2,'0')}:00`);
    } else {
      const now = new Date('2026-05-04');
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        arr.push(`${d.getMonth()+1}/${d.getDate()}`);
      }
    }
    return arr;
  }, [days, range]);

  const p50 = genSeries(days, { seed: seed+1, base: 42, trend: -0.1, noise: 0.15 });
  const p95 = genSeries(days, { seed: seed+2, base: 142, trend: -0.05, noise: 0.18 });
  const p99 = genSeries(days, { seed: seed+3, base: 286, trend: 0.0, noise: 0.22 });

  const errorRate = genSeries(days, { seed: seed+4, base: 0.18, trend: -0.4, noise: 0.5 });
  const successRate = errorRate.map(e => 100 - e * 100);

  const services = [
    { name: 'API Gateway',   provider: 'Cloudflare Workers', uptime: 99.998, p99: 142, rps: 28412, errors: 18, status: 'good' },
    { name: 'Auth Service',  provider: 'Supabase Auth',      uptime: 99.992, p99: 84,  rps: 4820,  errors: 2,  status: 'good' },
    { name: 'Postgres',      provider: 'Supabase',           uptime: 99.994, p99: 18,  rps: 12400, errors: 0,  status: 'good' },
    { name: 'Realtime',      provider: 'Supabase',           uptime: 99.978, p99: 312, rps: 1820,  errors: 12, status: 'warn' },
    { name: 'Storage',       provider: 'Supabase Storage',  uptime: 99.999, p99: 218, rps: 884,   errors: 0,  status: 'good' },
    { name: 'Sessions',      provider: 'Cloudflare DO',     uptime: 99.996, p99: 22,  rps: 18420, errors: 4,  status: 'good' },
    { name: 'Cache',         provider: 'Cloudflare KV',     uptime: 99.999, p99: 8,   rps: 142800, errors: 0, status: 'good' },
    { name: 'Analytics DB',  provider: 'Cloudflare D1',     uptime: 99.984, p99: 248, rps: 2412,  errors: 24, status: 'warn' },
    { name: 'Edge cache',    provider: 'Cloudflare CDN',    uptime: 100.000, p99: 4,  rps: 84200, errors: 0,  status: 'good' },
  ];

  const incidents = [
    { sev: 'P3', t: '2h ago', svc: 'Realtime', text: 'Subscription reconnect storm in eu-west-1', status: 'investigating' },
    { sev: 'P4', t: '6h ago', svc: 'Analytics DB', text: 'D1 read replica lag exceeded 800ms briefly', status: 'resolved' },
    { sev: 'P2', t: '1d ago', svc: 'API Gateway', text: 'Elevated 5xx in ap-southeast — rolled back v3.18.1', status: 'resolved' },
  ];

  const regions = [
    { code: 'iad', name: 'Washington (US-East)', rps: 12400, p99: 132, status: 'good' },
    { code: 'sfo', name: 'San Francisco (US-West)', rps: 7820, p99: 142, status: 'good' },
    { code: 'lhr', name: 'London (EU-West)', rps: 4820, p99: 168, status: 'good' },
    { code: 'fra', name: 'Frankfurt (EU-Central)', rps: 3240, p99: 152, status: 'good' },
    { code: 'sin', name: 'Singapore (AP-SE)', rps: 2120, p99: 218, status: 'warn' },
    { code: 'syd', name: 'Sydney (AP-SE-2)', rps: 980, p99: 184, status: 'good' },
    { code: 'gru', name: 'São Paulo (SA)', rps: 720, p99: 248, status: 'good' },
  ];

  const kvOps = genSeries(days, { seed: seed+20, base: 142000, trend: 0.5, noise: 0.15 });
  const doOps = genSeries(days, { seed: seed+21, base: 18400, trend: 0.4, noise: 0.18 });
  const d1Ops = genSeries(days, { seed: seed+22, base: 2400, trend: 0.6, noise: 0.2 });
  const sbReads = genSeries(days, { seed: seed+23, base: 84000, trend: 0.3, noise: 0.12 });
  const sbWrites = genSeries(days, { seed: seed+24, base: 12400, trend: 0.4, noise: 0.18 });

  const logs = [
    { ts: '14:42:18.418', lvl: 'info', svc: 'api-gw', msg: 'POST /v1/ingest 200 — 24ms — tenant:quantic-ai' },
    { ts: '14:42:18.402', lvl: 'ok',   svc: 'd1',     msg: 'Query OK — SELECT FROM events WHERE … (12ms)' },
    { ts: '14:42:18.388', lvl: 'info', svc: 'kv',     msg: 'GET sess:8a4f… HIT — 2ms' },
    { ts: '14:42:18.342', lvl: 'warn', svc: 'do',     msg: 'Hibernation reset — id:room-184 (idle 320s)' },
    { ts: '14:42:18.321', lvl: 'info', svc: 'sb-pg',  msg: 'INSERT events_v2 (b=824) — 8ms' },
    { ts: '14:42:18.298', lvl: 'err',  svc: 'd1',     msg: 'Replica lag 1284ms — failover to leader' },
    { ts: '14:42:18.244', lvl: 'info', svc: 'api-gw', msg: 'GET /v1/health 200 — 4ms' },
    { ts: '14:42:18.218', lvl: 'ok',   svc: 'sb-rt',  msg: 'Channel subscribed — tenant:acme:room:198' },
    { ts: '14:42:18.184', lvl: 'info', svc: 'kv',     msg: 'PUT cache:rate:412… — 1ms' },
    { ts: '14:42:18.142', lvl: 'warn', svc: 'do',     msg: 'CPU time 48ms — limit 50ms (room:204)' },
    { ts: '14:42:18.118', lvl: 'info', svc: 'api-gw', msg: 'POST /v1/auth/token 200 — 38ms' },
    { ts: '14:42:18.092', lvl: 'ok',   svc: 'sb-pg',  msg: 'Connection pool 142/200 — healthy' },
  ];

  // Gauge component
  const Gauge = ({ value, max, label, sub, color = 'var(--accent)' }) => {
    const pct = Math.min(1, value / max);
    const r = 50, c = Math.PI * r;
    return (
      <div style={{ textAlign: 'center' }}>
        <svg width="140" height="84" viewBox="0 0 140 84">
          <path d={`M 20 70 A 50 50 0 0 1 120 70`} fill="none" stroke="var(--bg-3)" strokeWidth="10" strokeLinecap="round" />
          <path d={`M 20 70 A 50 50 0 0 1 120 70`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${pct * c} ${c}`} />
        </svg>
        <div className="mono fw-600 text-lg" style={{ marginTop: -22 }}>{label}</div>
        <div className="muted text-xs">{sub}</div>
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Health</h1>
          <p className="page-sub">
            Infrastructure status • Supabase, Cloudflare Workers, Durable Objects, KV, D1
          </p>
        </div>
        <div className="page-actions">
          <span className="pill good"><span className="dot" /> All systems operational</span>
          <button className="btn"><Icon name="refresh" size={12} /> Refresh</button>
          <button className="btn"><Icon name="bell" size={12} /> Alerts</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI label="Uptime (30d)" value="99.992" unit="%" delta={0.04} sparkColor="var(--good)"
          spark={genSeries(28, { seed: 91, base: 99.99, trend: 0.0, noise: 0.001 })} icon="shield" />
        <KPI label="p99 latency" value="142" unit="ms" delta={-8.2} sparkColor="var(--accent)"
          spark={p99.slice(-30)} deltaLabel="lower is better" icon="clock" />
        <KPI label="Error rate" value="0.142" unit="%" delta={-22.4} sparkColor="var(--bad)"
          spark={errorRate.slice(-30)} deltaLabel="lower is better" icon="bolt" />
        <KPI label="Throughput" value="284.1" unit="K rps" delta={14.2} sparkColor="var(--accent)"
          spark={genSeries(28, { seed: 94, base: 240000, trend: 0.4, noise: 0.1 })} icon="activity" />
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-8">
          <div className="card-head">
            <div>
              <div className="card-title">Latency percentiles</div>
              <div className="card-sub">p50 / p95 / p99 across the API gateway</div>
            </div>
            <div className="row gap-2">
              <span className="pill"><span className="live-dot" /> Live</span>
              <div className="seg">
                <button className="active">All</button>
                <button>Reads</button>
                <button>Writes</button>
              </div>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={240}
              series={[
                { name: 'p99', data: p99, color: 'oklch(0.72 0.20 25)' },
                { name: 'p95', data: p95, color: 'oklch(0.82 0.16 85)' },
                { name: 'p50', data: p50, color: 'oklch(0.68 0.22 285)' },
              ]}
              xLabels={xLabels}
              yFormat={(v) => v.toFixed(0) + 'ms'}
            />
          </div>
        </div>

        <div className="card span-4">
          <div className="card-head">
            <div>
              <div className="card-title">Resource saturation</div>
              <div className="card-sub">Across primary region</div>
            </div>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Gauge value={62} max={100} label="62%" sub="CPU" color="oklch(0.68 0.22 285)" />
            <Gauge value={48} max={100} label="48%" sub="Memory" color="oklch(0.78 0.13 220)" />
            <Gauge value={28} max={100} label="28%" sub="Disk I/O" color="oklch(0.78 0.17 155)" />
            <Gauge value={84} max={100} label="84%" sub="Network" color="oklch(0.82 0.16 85)" />
          </div>
          <div className="card-foot">
            <span className="muted">Avg load (5m)</span>
            <span className="mono">2.42 / 8 cores</span>
          </div>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-12">
          <div className="card-head">
            <div>
              <div className="card-title">Services</div>
              <div className="card-sub">Status, throughput, and latency by service</div>
            </div>
            <button className="btn ghost text-xs">Configure SLOs →</button>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Provider</th>
                  <th>Uptime (30d)</th>
                  <th className="num">p99</th>
                  <th className="num">RPS</th>
                  <th className="num">Errors (1h)</th>
                  <th>Trend (24h)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={i} className="row-link">
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td className="muted">{s.provider}</td>
                    <td>
                      <div className="row gap-2">
                        <div style={{ width: 80, height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ width: `${(s.uptime - 99) * 100}%`, height: '100%', background: s.uptime >= 99.99 ? 'var(--good)' : s.uptime >= 99.95 ? 'var(--warn)' : 'var(--bad)' }} />
                        </div>
                        <span className="mono text-xs">{s.uptime.toFixed(3)}%</span>
                      </div>
                    </td>
                    <td className="num">{s.p99}ms</td>
                    <td className="num">{fmtNum(s.rps)}</td>
                    <td className="num" style={{ color: s.errors > 10 ? 'var(--warn)' : 'var(--fg-1)' }}>{s.errors}</td>
                    <td>
                      <Sparkline data={genSeries(24, { seed: i*7+1, base: s.rps, noise: 0.2 })} width={90} height={24} color={s.status === 'good' ? 'var(--good)' : 'var(--warn)'} />
                    </td>
                    <td><span className={`pill ${s.status}`}><span className="dot" /> {s.status === 'good' ? 'Operational' : 'Degraded'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-6">
          <div className="card-head">
            <div>
              <div className="card-title">Cloudflare workload</div>
              <div className="card-sub">DO sessions • KV ops • D1 queries</div>
            </div>
            <div className="seg">
              <button className="active">All</button>
              <button>DO</button>
              <button>KV</button>
              <button>D1</button>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={200}
              series={[
                { name: 'KV ops',     data: kvOps, color: 'oklch(0.68 0.22 285)' },
                { name: 'DO sessions', data: doOps, color: 'oklch(0.78 0.13 220)' },
                { name: 'D1 queries',  data: d1Ops, color: 'oklch(0.66 0.18 305)' },
              ]}
              xLabels={xLabels}
              yFormat={(v) => fmtNum(v, { compact: true })}
            />
            <div className="grid cols-3" style={{ marginTop: 12, gap: 8 }}>
              <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <div className="text-xs muted">KV reads/s</div>
                <div className="mono fw-600">142.8K</div>
                <div className="text-xs" style={{ color: 'var(--good)' }}>cache hit 96.2%</div>
              </div>
              <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <div className="text-xs muted">DO active</div>
                <div className="mono fw-600">18,420</div>
                <div className="text-xs muted">avg cpu 4.2ms</div>
              </div>
              <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <div className="text-xs muted">D1 size</div>
                <div className="mono fw-600">8.2 GB</div>
                <div className="text-xs muted">88 databases</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card span-6">
          <div className="card-head">
            <div>
              <div className="card-title">Supabase workload</div>
              <div className="card-sub">Postgres reads/writes • Realtime channels</div>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={200}
              stacked
              series={[
                { name: 'Reads',  data: sbReads, color: 'oklch(0.68 0.22 285)' },
                { name: 'Writes', data: sbWrites, color: 'oklch(0.66 0.18 305)' },
              ]}
              xLabels={xLabels}
              yFormat={(v) => fmtNum(v, { compact: true })}
            />
            <div className="grid cols-3" style={{ marginTop: 12, gap: 8 }}>
              <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <div className="text-xs muted">Connections</div>
                <div className="mono fw-600">142 / 200</div>
                <div className="text-xs muted">pooler healthy</div>
              </div>
              <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <div className="text-xs muted">Realtime ch.</div>
                <div className="mono fw-600">1,820</div>
                <div className="text-xs" style={{ color: 'var(--good)' }}>+ 12 / min</div>
              </div>
              <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                <div className="text-xs muted">DB size</div>
                <div className="mono fw-600">142.8 GB</div>
                <div className="text-xs muted">replica lag 28ms</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">Edge regions</div>
              <div className="card-sub">Global request routing</div>
            </div>
          </div>
          <div className="card-body">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Region</th>
                  <th className="num">RPS</th>
                  <th className="num">p99</th>
                  <th>Load</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r, i) => {
                  const max = Math.max(...regions.map(x => x.rps));
                  return (
                    <tr key={i}>
                      <td>
                        <div className="row gap-2">
                          <span className="mono text-xs" style={{ color: 'var(--fg-2)', textTransform: 'uppercase' }}>{r.code}</span>
                          <span>{r.name}</span>
                        </div>
                      </td>
                      <td className="num">{fmtNum(r.rps)}</td>
                      <td className="num">{r.p99}ms</td>
                      <td>
                        <div style={{ width: 100, height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${(r.rps / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                        </div>
                      </td>
                      <td><span className={`pill ${r.status}`}><span className="dot" /> {r.status === 'good' ? 'OK' : 'Watch'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">Recent incidents</div>
              <div className="card-sub">Last 7 days</div>
            </div>
            <button className="btn ghost text-xs">View status page →</button>
          </div>
          <div className="card-body" style={{ padding: '0 14px 14px' }}>
            {incidents.map((inc, i) => (
              <div key={i} className="row gap-3" style={{ padding: '12px 0', borderBottom: i < incidents.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                <span className={`pill ${inc.sev === 'P2' ? 'bad' : inc.sev === 'P3' ? 'warn' : 'info'}`}>{inc.sev}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm">{inc.text}</div>
                  <div className="row gap-2 text-xs muted" style={{ marginTop: 2 }}>
                    <span>{inc.svc}</span>
                    <span>•</span>
                    <span>{inc.t}</span>
                    <span>•</span>
                    <span style={{ color: inc.status === 'resolved' ? 'var(--good)' : 'var(--warn)' }}>{inc.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Live log stream</div>
            <div className="card-sub">Aggregated across all services</div>
          </div>
          <div className="row gap-2">
            <span className="pill"><span className="live-dot" /> Streaming</span>
            <div className="seg">
              <button className="active">All</button>
              <button>Errors</button>
              <button>Warnings</button>
            </div>
            <button className="icon-btn"><Icon name="pause" size={13} /></button>
          </div>
        </div>
        <div className="card-body">
          <div className="log">
            {logs.map((l, i) => (
              <div key={i} className="line">
                <span className="ts">{l.ts}</span>
                <span className={`lvl-${l.lvl}`} style={{ display: 'inline-block', width: 44 }}>[{l.lvl.toUpperCase()}]</span>
                <span style={{ color: 'var(--fg-2)', marginRight: 8 }}>{l.svc}</span>
                <span>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

window.HealthPage = HealthPage;
