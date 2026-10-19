import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Donut,
  Icon,
  KPI,
} from "@inneranimalmedia/commerce-analytics";
import { fmtNum } from "../../lib/format";
import { fetchFinanceAnalytics } from "../../lib/api";
import type { FinanceAnalyticsResponse, RangeKey } from "../../lib/types";

type PageProps = { range: RangeKey; tenant?: string };

function formatKpiMoney(dollars: number) {
  if (dollars >= 1_000_000) return { value: (dollars / 1_000_000).toFixed(2), unit: "M" };
  if (dollars >= 1_000) return { value: (dollars / 1_000).toFixed(1), unit: "K" };
  return { value: dollars.toFixed(2), unit: dollars >= 100 ? "" : "" };
}

function formatKpiNumber(n: number) {
  if (n >= 1_000_000) return { value: (n / 1_000_000).toFixed(2), unit: "M" };
  if (n >= 10_000) return { value: (n / 1_000).toFixed(1), unit: "K" };
  return { value: String(n), unit: "" };
}

function exportOrdersCsv(orders: FinanceAnalyticsResponse["recent_orders"]) {
  const header = "Order,Customer,Date,Method,Amount,Status\n";
  const rows = orders
    .map(
      (o) =>
        `${o.id},"${o.customer.replace(/"/g, '""')}",${o.date},${o.method},${(o.amount_cents / 100).toFixed(2)},${o.status}`
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fnf-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinancePage({ range }: PageProps) {
  const [data, setData] = useState<FinanceAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadingRange = data?.range !== range;

  useEffect(() => {
    let cancelled = false;
    fetchFinanceAnalytics(range)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load finance data");
      })
      .finally(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [range]);

  const revenueKpi = useMemo(
    () => (data ? formatKpiMoney(data.kpis.gross_revenue.value) : null),
    [data]
  );
  const ordersKpi = useMemo(
    () => (data ? formatKpiNumber(data.kpis.orders.value) : null),
    [data]
  );
  const aovKpi = useMemo(
    () => (data ? formatKpiMoney(data.kpis.avg_order_value.value) : null),
    [data]
  );
  const unitsKpi = useMemo(
    () => (data ? formatKpiNumber(data.kpis.units_sold.value) : null),
    [data]
  );

  const mixData = data?.product_mix?.length ? data.product_mix : data?.status_mix || [];
  const mixTotal = data?.product_mix?.length
    ? data.mix_totals.product
    : data?.mix_totals.status || 0;
  const mixLabel = data?.product_mix?.length ? "Product mix" : "Order status";
  const mixSub = data?.product_mix?.length
    ? "Revenue by product"
    : "Revenue by order status";

  if (loadingRange && !data) {
    return (
      <div className="page-head">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-sub">Loading store revenue from D1…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page-head">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-sub" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const refreshed = new Date(data.refreshed_at);
  const refreshLabel = Number.isNaN(refreshed.getTime())
    ? "just now"
    : refreshed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-sub">
            Fuel &amp; Free Time store revenue, orders, and operating costs • D1 live •{" "}
            {data.range} • refreshed {refreshLabel}
            {!data.stripe_connected && " • Stripe pending"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn ghost" type="button" disabled title="Coming soon">
            <Icon name="filter" size={12} /> Compare
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => exportOrdersCsv(data.recent_orders)}
          >
            <Icon name="download" size={12} /> Export CSV
          </button>
          <a className="btn primary" href="/admin/orders">
            <Icon name="receipt" size={12} /> View orders
          </a>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI
          label="Gross revenue"
          value={revenueKpi?.unit === "" ? `$${revenueKpi.value}` : `$${revenueKpi?.value ?? "0"}`}
          unit={revenueKpi?.unit || undefined}
          delta={data.kpis.gross_revenue.delta}
          sparkColor="var(--good)"
          spark={data.kpis.gross_revenue.spark}
          icon="finance"
        />
        <KPI
          label="Orders"
          value={ordersKpi?.value ?? "0"}
          unit={ordersKpi?.unit || undefined}
          delta={data.kpis.orders.delta}
          sparkColor="var(--accent)"
          spark={data.kpis.orders.spark}
          icon="sparkles"
        />
        <KPI
          label="Avg order value"
          value={aovKpi?.unit === "" ? `$${aovKpi.value}` : `$${aovKpi?.value ?? "0"}`}
          unit={aovKpi?.unit || undefined}
          delta={data.kpis.avg_order_value.delta}
          sparkColor="var(--good)"
          spark={data.kpis.avg_order_value.spark}
        />
        <KPI
          label="Units sold"
          value={unitsKpi?.value ?? "0"}
          unit={unitsKpi?.unit || undefined}
          delta={data.kpis.units_sold.delta}
          sparkColor="var(--accent)"
          spark={data.kpis.units_sold.spark}
        />
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-8">
          <div className="card-head">
            <div>
              <div className="card-title">Revenue breakdown</div>
              <div className="card-sub">Stacked by status • confirmed, pending, total</div>
            </div>
            <div className="seg">
              <button className="active" type="button">
                Stacked
              </button>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={260}
              stacked
              series={data.revenue_series.series}
              xLabels={data.revenue_series.labels}
              yFormat={(v) => "$" + fmtNum(v, { compact: true })}
            />
          </div>
        </div>

        <div className="card span-4">
          <div className="card-head">
            <div>
              <div className="card-title">{mixLabel}</div>
              <div className="card-sub">{mixSub}</div>
            </div>
          </div>
          <div className="card-body">
            {mixData.length ? (
              <>
                <Donut
                  data={mixData}
                  label={`$${fmtNum(mixTotal, { compact: true })}`}
                  sub={data.range}
                />
                <div className="col" style={{ marginTop: 14, gap: 8 }}>
                  {mixData.map((p, i) => {
                    const total = mixData.reduce((a, b) => a + b.value, 0) || 1;
                    const pct = (p.value / total) * 100;
                    return (
                      <div key={i} className="row-between text-xs">
                        <div className="row gap-2">
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              background: p.color,
                            }}
                          />
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
              </>
            ) : (
              <p className="text-sm muted">No order data in this range yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid cols-12" style={{ marginBottom: 14 }}>
        <div className="card span-4">
          <div className="card-head">
            <div>
              <div className="card-title">Unit economics</div>
              <div className="card-sub">Store metrics • {data.range}</div>
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {data.unit_economics.map((m, i) => (
              <div
                key={i}
                className="row-between"
                style={{
                  paddingBottom: 10,
                  borderBottom:
                    i < data.unit_economics.length - 1 ? "1px solid var(--line-soft)" : "none",
                }}
              >
                <span className="text-sm muted" title={m.hint}>
                  {m.label}
                </span>
                <div className="row gap-3">
                  <span className="mono fw-600 text-sm">{m.value}</span>
                  {m.delta !== 0 && (
                    <span className={`kpi-delta ${m.good ? "up" : "down"}`} style={{ fontSize: 11 }}>
                      {m.delta > 0 ? "▲" : "▼"} {Math.abs(m.delta).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-8">
          <div className="card-head">
            <div>
              <div className="card-title">Cost structure</div>
              <div className="card-sub">Estimated COGS vs AgentSam AI spend</div>
            </div>
            <div className="row gap-2">
              <span className="pill">
                <span className="dot" style={{ background: "oklch(0.78 0.13 220)" }} /> AI:{" "}
                {data.cost_series.ai_pct_of_revenue}% of rev
              </span>
              <span className="pill">
                <span className="dot" style={{ background: "oklch(0.66 0.18 305)" }} /> Est.
                COGS: {data.cost_series.cogs_pct_of_revenue}%
              </span>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              height={240}
              type="bar"
              series={data.cost_series.series}
              xLabels={data.cost_series.labels}
              yFormat={(v) => "$" + fmtNum(v, { compact: true })}
            />
          </div>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">Recent orders</div>
              <div className="card-sub">
                ${fmtNum(data.recent_orders_summary.collected_cents / 100)} collected in view •{" "}
                {data.recent_orders_summary.pending_count} pending
              </div>
            </div>
          </div>
          <div style={{ overflow: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Channel</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.length ? (
                  data.recent_orders.map((order, i) => (
                    <tr key={i} className="row-link">
                      <td className="mono">{order.id}</td>
                      <td>{order.customer}</td>
                      <td className="muted">{order.date}</td>
                      <td>
                        <span className="pill">{order.method}</span>
                      </td>
                      <td className="num">${fmtNum(order.amount_cents / 100)}</td>
                      <td>
                        <span
                          className={`pill ${
                            order.status === "paid" || order.status === "fulfilled"
                              ? "good"
                              : order.status === "pending"
                                ? "warn"
                                : "bad"
                          }`}
                        >
                          <span className="dot" /> {order.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted text-sm">
                      No orders yet — checkout creates pending orders in D1.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">Customer cohorts</div>
              <div className="card-sub">New customers by month • M1 return rate</div>
            </div>
          </div>
          <div className="card-body">
            {data.customer_cohorts.length ? (
              <>
                <table className="tbl" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Cohort</th>
                      <th className="num">Size</th>
                      <th className="num">M0</th>
                      <th className="num">M1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customer_cohorts.map((c, i) => (
                      <tr key={i}>
                        <td className="mono">{c.month}</td>
                        <td className="num">{c.size}</td>
                        {[0, 1].map((m) => {
                          const v = c.retention[m];
                          if (v == null) return <td key={m} className="num muted">–</td>;
                          const intensity = v / 100;
                          return (
                            <td
                              key={m}
                              className="num"
                              style={{
                                background: `oklch(0.30 ${intensity * 0.18} 285 / ${0.2 + intensity * 0.7})`,
                                color: intensity > 0.7 ? "white" : "var(--fg-1)",
                                fontWeight: 500,
                              }}
                            >
                              {v}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-sm muted">Cohort data appears once repeat customers exist.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
