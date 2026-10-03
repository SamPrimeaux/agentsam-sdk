// Finance Dashboard
function FinancePage({ range, tenant }) {
  const seed = 42;
  const days = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === 'YTD' ? 124 : 365;
  const xLabels = useMemo(() => {
    const arr = [];
    const now = new Date('2026-05-04');
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      arr.push(`${d.getMonth()+1}/${d.getDate()}`);
    }
    return arr;
  }, [days]);

  const subscription = genSeries(days, { seed: seed+1, base: 12000, trend: 0.45, noise: 0.06, season: 0.05 });
  const usage = genSeries(days, { seed: seed+2, base: 3400, trend: 0.6, noise: 0.18 });
  const services = genSeries(days, { seed: seed+3, base: 1800, trend: 0.3, noise: 0.12 });
  const refunds = genSeries(days, { seed: seed+4, base: -240, trend: 0.1, noise: 0.5 });

  const cogs = genSeries(days, { seed: seed+10, base: 3200, trend: 0.3, noise: 0.08 });
  const infra = genSeries(days, { seed: seed+11, base: 1800, trend: 0.4, noise: 0.12 });

  const planMix = [
    { label: 'Enterprise', value: 248400, color: 'oklch(0.68 0.22 285)' },
    { label: 'Scale',      value: 142800, color: 'oklch(0.66 0.18 305)' },
    { label: 'Growth',     value: 18800,  color: 'oklch(0.62 0.14 325)' },
    { label: 'Free',       value: 8200,   color: 'oklch(0.50 0.06 270)' },
  ];

  const invoices = [
    { id: 'INV-20984', tenant: 'Quantic AI', amount: 42000, status: 'paid', date: 'May 1', due: 'Net 30', method: 'ACH' },
    { id: 'INV-20983', tenant: 'Mosaic Finance', amount: 31200, status: 'paid', date: 'May 1', due: 'Net 30', method: 'Wire' },
    { id: 'INV-20982', tenant: 'Acme Studios', amount: 24800, status: 'paid', date: 'May 1', due: 'Net 30', method: 'Card' },
    { id: 'INV-20981', tenant: 'Orbit Retail', amount: 9600, status: 'pending', date: 'Apr 28', due: 'May 12', method: 'ACH' },
    { id: 'INV-20980', tenant: 'Lumen Health', amount: 8400, status: 'paid', date: 'Apr 28', due: 'Net 30', method: 'Card' },
    { id: 'INV-20979', tenant: 'Nimbus Labs', amount: 2400, status: 'overdue', date: 'Apr 14', due: 'Apr 28', method: 'Card' },
    { id: 'INV-20978', tenant: 'Pinecrest Co.', amount: 1800, status: 'paid', date: 'Apr 12', due: 'Net 30', method: 'Card' },
  ];

  const cohorts = [
    { month: 'Nov 25', size: 142, retention: [100, 84, 72, 64, 58, 52] },
    { month: 'Dec 25', size: 168, retention: [100, 86, 76, 68, 60] },
    { month: 'Jan 26', size: 218, retention: [100, 88, 78, 70] },
    { month: 'Feb 26', size: 184, retention: [100, 90, 80] },
    { month: 'Mar 26', size: 242, retention: [100, 92] },
    { month: 'Apr 26', size: 312, retention: [100] },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-sub">Revenue, billing, and unit economics across all tenants</p>
        </div>
        <div className="page-actions">
          <button className="btn ghost"><Icon name="filter" size={12} /> Compare</button>
          <button className="btn"><Icon name="download" size={12} /> Export CSV</button>
          <button className="btn primary"><Icon name="receipt" size={12} /> New invoice</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI label="MRR" value="$418.2" unit="K" delta={8.4} sparkColor="var(--good)"
          spark={genSeries(28, { seed: 81, base: 360000, trend: 0.5, noise: 0.04 })} icon="finance" />
        <KPI label="ARR" value="$5.02" unit="M" delta={11.2} sparkColor="var(--accent)"
          spark={genSeries(28, { seed: 82, base: 4200000, trend: 0.5, noise: 0.04 })} icon="sparkles" />
        <KPI label="Net revenue retention" value="118.4" unit="%" delta={2.6} sparkColor="var(--good)"
          spark={genSeries(28, { seed: 83, base: 110, trend: 0.1, noise: 0.04 })} />
        <KPI label="Gross margin" value="78.2" unit="%" delta={1.8} sparkColor="var(--accent)"
          spark={genSeries(28, { seed: 84, base: 76, trend: 0.04, noise: 0.02 })} />
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-8">
          <div className="card-head">
            <div>
              <div className="card-title">Revenue breakdown</div>
              <div className="card-sub">Stacked by source • Subscription, usage-based, services</div>
            </div>
            <div className="seg">
              <button className="active">Stacked</button>
              <button>Lines</button>
              <button>Bars</button>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={260}
              stacked
              series={[
                { name: 'Subscription', data: subscription, color: 'oklch(0.68 0.22 285)' },
                { name: 'Usage',         data: usage,         color: 'oklch(0.66 0.18 305)' },
                { name: 'Services',     data: services,     color: 'oklch(0.62 0.14 325)' },
              ]}
              xLabels={xLabels}
              yFormat={(v) => '$' + fmtNum(v, { compact: true })}
            />
          </div>
        </div>

        <div className="card span-4">
          <div className="card-head">
            <div>
              <div className="card-title">Plan mix</div>
              <div className="card-sub">Revenue contribution</div>
            </div>
          </div>
          <div className="card-body">
            <Donut data={planMix} label="$418K" sub="MRR" />
            <div className="col" style={{ marginTop: 14, gap: 8 }}>
              {planMix.map((p, i) => {
                const total = planMix.reduce((a, b) => a + b.value, 0);
                const pct = (p.value / total) * 100;
                return (
                  <div key={i} className="row-between text-xs">
                    <div className="row gap-2">
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                      {p.label}
                    </div>
                    <div className="row gap-3">
                      <span className="mono muted">{pct.toFixed(1)}%</span>
                      <span className="mono">${fmtNum(p.value, { compact: true })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-4">
          <div className="card-head">
            <div>
              <div className="card-title">Unit economics</div>
              <div className="card-sub">Last 90 days, blended</div>
            </div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'CAC', value: '$842', delta: -4.2, good: true },
              { label: 'LTV', value: '$18,420', delta: 8.4, good: true },
              { label: 'LTV / CAC', value: '21.9x', delta: 12.1, good: true },
              { label: 'Payback period', value: '4.2 mo', delta: -8.0, good: true },
              { label: 'Churn (logo)', value: '1.8%', delta: -0.4, good: true },
              { label: 'Churn (revenue)', value: '0.6%', delta: -0.2, good: true },
              { label: 'Avg deal size', value: '$5,420', delta: 14.2, good: true },
            ].map((m, i) => (
              <div key={i} className="row-between" style={{ paddingBottom: 10, borderBottom: i < 6 ? '1px solid var(--line-soft)' : 'none' }}>
                <span className="text-sm muted">{m.label}</span>
                <div className="row gap-3">
                  <span className="mono fw-600 text-sm">{m.value}</span>
                  <span className={`kpi-delta ${m.good ? 'up' : 'down'}`} style={{ fontSize: 11 }}>
                    {m.delta > 0 ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-8">
          <div className="card-head">
            <div>
              <div className="card-title">Cost structure</div>
              <div className="card-sub">COGS vs infrastructure spend</div>
            </div>
            <div className="row gap-2">
              <span className="pill"><span className="dot" style={{ background: 'oklch(0.78 0.13 220)' }} /> Infra: 28% of rev</span>
              <span className="pill"><span className="dot" style={{ background: 'oklch(0.66 0.18 305)' }} /> COGS: 22% of rev</span>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={240}
              type="bar"
              series={[
                { name: 'COGS', data: cogs, color: 'oklch(0.66 0.18 305)' },
                { name: 'Infrastructure', data: infra, color: 'oklch(0.78 0.13 220)' },
              ]}
              xLabels={xLabels}
              yFormat={(v) => '$' + fmtNum(v, { compact: true })}
            />
          </div>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">Recent invoices</div>
              <div className="card-sub">$120,200 collected this period • 1 overdue</div>
            </div>
            <div className="row gap-2">
              <div className="seg">
                <button className="active">All</button>
                <button>Paid</button>
                <button>Pending</button>
                <button>Overdue</button>
              </div>
            </div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Tenant</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={i} className="row-link">
                    <td className="mono">{inv.id}</td>
                    <td>{inv.tenant}</td>
                    <td className="muted">{inv.date}</td>
                    <td className="muted">{inv.due}</td>
                    <td><span className="pill">{inv.method}</span></td>
                    <td className="num">${fmtNum(inv.amount)}</td>
                    <td>
                      <span className={`pill ${inv.status === 'paid' ? 'good' : inv.status === 'pending' ? 'warn' : 'bad'}`}>
                        <span className="dot" /> {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">Cohort retention</div>
              <div className="card-sub">% of paying customers retained, by signup month</div>
            </div>
          </div>
          <div className="card-body">
            <table className="tbl" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th className="num">Size</th>
                  {[0,1,2,3,4,5].map(m => <th key={m} className="num">M{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{c.month}</td>
                    <td className="num">{c.size}</td>
                    {[0,1,2,3,4,5].map(m => {
                      const v = c.retention[m];
                      if (v == null) return <td key={m} className="num muted">–</td>;
                      const intensity = v / 100;
                      return (
                        <td key={m} className="num" style={{
                          background: `oklch(0.30 ${intensity * 0.18} 285 / ${0.2 + intensity * 0.7})`,
                          color: intensity > 0.7 ? 'white' : 'var(--fg-1)',
                          fontWeight: 500,
                        }}>{v}%</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row-between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
              <span className="text-xs muted">Avg M3 retention</span>
              <span className="mono fw-600" style={{ color: 'var(--good)' }}>69.4%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.FinancePage = FinancePage;
