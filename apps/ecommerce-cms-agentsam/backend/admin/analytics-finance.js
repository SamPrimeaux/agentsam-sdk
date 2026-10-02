/**
 * Finance analytics — real D1 aggregates for /admin/analytics/finance
 */

const STATUS_COLORS = {
  pending: "oklch(0.72 0.16 85)",
  awaiting_payment: "oklch(0.72 0.16 85)",
  expired: "oklch(0.62 0.14 60)",
  failed: "oklch(0.62 0.18 25)",
  paid: "oklch(0.78 0.17 155)",
  fulfilled: "oklch(0.68 0.22 285)",
  cancelled: "oklch(0.62 0.18 25)",
  refunded: "oklch(0.55 0.12 270)",
};

const PRODUCT_COLORS = [
  "oklch(0.68 0.22 285)",
  "oklch(0.66 0.18 305)",
  "oklch(0.62 0.14 325)",
  "oklch(0.78 0.13 220)",
  "oklch(0.78 0.17 155)",
  "oklch(0.72 0.16 85)",
];

function rangeConfig(range = "30d") {
  const now = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  switch (range) {
    case "24h":
      return { days: 1, bucket: "hour", prevDays: 1, label: "24h" };
    case "7d":
      return { days: 7, bucket: "day", prevDays: 7, label: "7d" };
    case "90d":
      return { days: 90, bucket: "day", prevDays: 90, label: "90d" };
    case "YTD": {
      const days = Math.max(
        1,
        Math.ceil((now.getTime() - ytdStart.getTime()) / 86400000)
      );
      return { days, bucket: "day", prevDays: days, label: "YTD", sinceYtd: true };
    }
    case "All":
      return { days: 365, bucket: "day", prevDays: 365, label: "All", allTime: true };
    case "30d":
    default:
      return { days: 30, bucket: "day", prevDays: 30, label: "30d" };
  }
}

function pctDelta(current, previous) {
  if (!previous || previous === 0) {
    if (!current || current === 0) return 0;
    return 100;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function formatShortDate(iso, bucket) {
  if (!iso) return "";
  if (bucket === "hour") {
    const h = iso.slice(11, 13);
    return `${h}:00`;
  }
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function centsToDollars(cents) {
  return (Number(cents || 0) / 100);
}

async function safeQuery(env, sql, ...binds) {
  try {
    if (!env.DB) return null;
    const stmt = env.DB.prepare(sql);
    return binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  } catch (err) {
    console.error("finance analytics query failed", err?.message || err);
    return null;
  }
}

async function safeFirst(env, sql, ...binds) {
  try {
    if (!env.DB) return null;
    const stmt = env.DB.prepare(sql);
    return binds.length ? await stmt.bind(...binds).first() : await stmt.first();
  } catch {
    return null;
  }
}

function buildBucketLabels(days, bucket) {
  const labels = [];
  const keys = [];
  const now = new Date();

  if (bucket === "hour") {
    for (let i = 23; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setHours(d.getHours() - i, 0, 0, 0);
      const key = d.toISOString().slice(0, 13);
      keys.push(key);
      labels.push(formatShortDate(`${key}:00:00`, "hour"));
    }
    return { labels, keys };
  }

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    keys.push(key);
    labels.push(formatShortDate(key, "day"));
  }
  return { labels, keys };
}

async function periodTotals(env, sinceModifier) {
  const row = await safeFirst(
    env,
    `SELECT
       COUNT(*) AS orders,
       COALESCE(SUM(total_cents), 0) AS revenue_cents,
       COALESCE(SUM(CASE WHEN status IN ('pending','awaiting_payment') THEN total_cents ELSE 0 END), 0) AS pending_cents,
       COALESCE(SUM(CASE WHEN status IN ('paid','fulfilled') THEN total_cents ELSE 0 END), 0) AS confirmed_cents
     FROM orders
     WHERE datetime(created_at) >= datetime('now', ?)`,
    sinceModifier
  );

  const units = await safeFirst(
    env,
    `SELECT COALESCE(SUM(oi.qty), 0) AS units
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE datetime(o.created_at) >= datetime('now', ?)`,
    sinceModifier
  );

  const customers = await safeFirst(
    env,
    `SELECT COUNT(DISTINCT customer_email) AS customers
     FROM orders
     WHERE customer_email IS NOT NULL
       AND datetime(created_at) >= datetime('now', ?)`,
    sinceModifier
  );

  const orders = Number(row?.orders || 0);
  const revenueCents = Number(row?.revenue_cents || 0);

  return {
    orders,
    revenue_cents: revenueCents,
    pending_cents: Number(row?.pending_cents || 0),
    confirmed_cents: Number(row?.confirmed_cents || 0),
    units: Number(units?.units || 0),
    customers: Number(customers?.customers || 0),
    aov_cents: orders > 0 ? Math.round(revenueCents / orders) : 0,
  };
}

async function revenueByBucket(env, cfg) {
  const { keys, labels } = buildBucketLabels(cfg.days, cfg.bucket);
  const modifier = cfg.bucket === "hour" ? "-1 day" : `-${cfg.days} days`;

  if (cfg.bucket === "hour") {
    const { results } =
      (await safeQuery(
        env,
        `SELECT strftime('%Y-%m-%dT%H', created_at) AS bucket,
                COALESCE(SUM(total_cents), 0) AS revenue_cents,
                COALESCE(SUM(CASE WHEN status IN ('pending','awaiting_payment') THEN total_cents ELSE 0 END), 0) AS pending_cents,
                COALESCE(SUM(CASE WHEN status IN ('paid','fulfilled') THEN total_cents ELSE 0 END), 0) AS confirmed_cents
         FROM orders
         WHERE datetime(created_at) >= datetime('now', '-1 day')
         GROUP BY bucket
         ORDER BY bucket ASC`
      )) || {};

    const revenue = keys.map((k) => {
      const row = (results || []).find((r) => r.bucket === k);
      return centsToDollars(row?.revenue_cents);
    });
    const pending = keys.map((k) => {
      const row = (results || []).find((r) => r.bucket === k);
      return centsToDollars(row?.pending_cents);
    });
    const confirmed = keys.map((k) => {
      const row = (results || []).find((r) => r.bucket === k);
      return centsToDollars(row?.confirmed_cents);
    });

    return { labels, revenue, pending, confirmed };
  }

  const { results } =
    (await safeQuery(
      env,
      `SELECT date(created_at) AS bucket,
              COALESCE(SUM(total_cents), 0) AS revenue_cents,
              COALESCE(SUM(CASE WHEN status IN ('pending','awaiting_payment') THEN total_cents ELSE 0 END), 0) AS pending_cents,
              COALESCE(SUM(CASE WHEN status IN ('paid','fulfilled') THEN total_cents ELSE 0 END), 0) AS confirmed_cents
       FROM orders
       WHERE datetime(created_at) >= datetime('now', ?)
       GROUP BY bucket
       ORDER BY bucket ASC`,
      modifier
    )) || {};

  const mapRev = new Map((results || []).map((r) => [r.bucket, centsToDollars(r.revenue_cents)]));
  const mapPending = new Map((results || []).map((r) => [r.bucket, centsToDollars(r.pending_cents)]));
  const mapConfirmed = new Map((results || []).map((r) => [r.bucket, centsToDollars(r.confirmed_cents)]));

  return {
    labels,
    revenue: keys.map((k) => mapRev.get(k) ?? 0),
    pending: keys.map((k) => mapPending.get(k) ?? 0),
    confirmed: keys.map((k) => mapConfirmed.get(k) ?? 0),
  };
}

async function orderSparkline(env, days) {
  const { results } =
    (await safeQuery(
      env,
      `SELECT date(created_at) AS bucket, COALESCE(SUM(total_cents), 0) AS revenue_cents
       FROM orders
       WHERE datetime(created_at) >= datetime('now', ?)
       GROUP BY bucket
       ORDER BY bucket ASC`,
      `-${Math.min(days, 28)} days`
    )) || {};

  const { keys } = buildBucketLabels(Math.min(days, 28), "day");
  const map = new Map((results || []).map((r) => [r.bucket, centsToDollars(r.revenue_cents)]));
  return keys.map((k) => map.get(k) ?? 0);
}

async function statusMix(env, sinceModifier) {
  const { results } =
    (await safeQuery(
      env,
      `SELECT status,
              COUNT(*) AS orders,
              COALESCE(SUM(total_cents), 0) AS revenue_cents
       FROM orders
       WHERE datetime(created_at) >= datetime('now', ?)
       GROUP BY status
       ORDER BY revenue_cents DESC`,
      sinceModifier
    )) || {};

  return (results || []).map((row, i) => ({
    label: String(row.status || "unknown").replace(/^\w/, (c) => c.toUpperCase()),
    value: centsToDollars(row.revenue_cents),
    orders: Number(row.orders || 0),
    color: STATUS_COLORS[row.status] || PRODUCT_COLORS[i % PRODUCT_COLORS.length],
  }));
}

async function productMix(env, sinceModifier) {
  const { results } =
    (await safeQuery(
      env,
      `SELECT oi.title,
              COALESCE(SUM(oi.qty * oi.price_cents), 0) AS revenue_cents,
              COALESCE(SUM(oi.qty), 0) AS units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE datetime(o.created_at) >= datetime('now', ?)
       GROUP BY oi.title
       ORDER BY revenue_cents DESC
       LIMIT 6`,
      sinceModifier
    )) || {};

  return (results || []).map((row, i) => ({
    label: row.title,
    value: centsToDollars(row.revenue_cents),
    units: Number(row.units || 0),
    color: PRODUCT_COLORS[i % PRODUCT_COLORS.length],
  }));
}

async function aiCostSeries(env, cfg) {
  const modifier = cfg.bucket === "hour" ? "-1 day" : `-${cfg.days} days`;
  const { results } =
    (await safeQuery(
      env,
      `SELECT date_key AS bucket,
              COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd
       FROM agentsam_analytics
       WHERE event_name = 'chat_response_completed'
         AND date(created_at) >= date('now', ?)
       GROUP BY date_key
       ORDER BY date_key ASC`,
      modifier
    )) || {};

  const { keys, labels } = buildBucketLabels(cfg.days, cfg.bucket);
  const map = new Map((results || []).map((r) => [r.bucket, Number(r.cost_usd || 0)]));
  const ai = keys.map((k) => map.get(k) ?? 0);
  return { labels, ai };
}

async function unitEconomics(env, sinceModifier, current, previous) {
  const repeat = await safeFirst(
    env,
    `SELECT COUNT(*) AS repeat_customers
     FROM (
       SELECT customer_email
       FROM orders
       WHERE customer_email IS NOT NULL
         AND datetime(created_at) >= datetime('now', ?)
       GROUP BY customer_email
       HAVING COUNT(*) > 1
     )`,
    sinceModifier
  );

  const subscribers = await safeFirst(
    env,
    `SELECT COUNT(*) AS n FROM newsletter_subscribers`
  );

  const aiCost = await safeFirst(
    env,
    `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost
     FROM agentsam_analytics
     WHERE event_name = 'chat_response_completed'
       AND datetime(created_at) >= datetime('now', ?)`,
    sinceModifier
  );

  const itemsPerOrder =
    current.orders > 0 ? Number((current.units / current.orders).toFixed(1)) : 0;
  const repeatRate =
    current.customers > 0
      ? Number(((Number(repeat?.repeat_customers || 0) / current.customers) * 100).toFixed(1))
      : 0;
  const pendingRate =
    current.orders > 0
      ? Number(((current.pending_cents / current.revenue_cents) * 100).toFixed(1))
      : 0;
  const aiCostUsd = Number(aiCost?.cost || 0);
  const grossMargin =
    current.revenue_cents > 0
      ? Number(
          (
            ((centsToDollars(current.revenue_cents) - aiCostUsd) /
              centsToDollars(current.revenue_cents)) *
            100
          ).toFixed(1)
        )
      : 0;

  return [
    {
      label: "Avg order value",
      value: `$${centsToDollars(current.aov_cents).toFixed(2)}`,
      delta: pctDelta(current.aov_cents, previous.aov_cents),
      good: current.aov_cents >= previous.aov_cents,
    },
    {
      label: "Items per order",
      value: String(itemsPerOrder),
      delta: pctDelta(itemsPerOrder, previous.orders > 0 ? previous.units / previous.orders : 0),
      good: itemsPerOrder >= (previous.orders > 0 ? previous.units / previous.orders : 0),
    },
    {
      label: "Unique customers",
      value: String(current.customers),
      delta: pctDelta(current.customers, previous.customers),
      good: current.customers >= previous.customers,
    },
    {
      label: "Repeat customer rate",
      value: `${repeatRate}%`,
      delta: 0,
      good: repeatRate >= 0,
    },
    {
      label: "Pending order share",
      value: `${pendingRate}%`,
      delta: pctDelta(pendingRate, previous.revenue_cents > 0 ? (previous.pending_cents / previous.revenue_cents) * 100 : 0),
      good: pendingRate <= (previous.revenue_cents > 0 ? (previous.pending_cents / previous.revenue_cents) * 100 : 0),
    },
    {
      label: "Newsletter subscribers",
      value: String(subscribers?.n ?? 0),
      delta: 0,
      good: true,
    },
    {
      label: "AgentSam AI cost",
      value: `$${aiCostUsd.toFixed(2)}`,
      delta: 0,
      good: false,
    },
    {
      label: "Est. gross margin",
      value: `${grossMargin}%`,
      delta: 0,
      good: grossMargin >= 0,
      hint: "Revenue minus tracked AI cost only",
    },
  ];
}

async function recentOrders(env, limit = 8) {
  const { results } =
    (await safeQuery(
      env,
      `SELECT id, customer_email, status, total_cents, created_at
       FROM orders
       ORDER BY created_at DESC
       LIMIT ?`,
      limit
    )) || {};

  return (results || []).map((row) => ({
    id: `#${row.id}`,
    customer: row.customer_email || "Guest",
    date: formatShortDate(String(row.created_at).slice(0, 10), "day"),
    created_at: row.created_at,
    method: "Store checkout",
    amount_cents: Number(row.total_cents || 0),
    status: row.status || "pending",
  }));
}

async function customerCohorts(env) {
  const { results } =
    (await safeQuery(
      env,
      `WITH first_order AS (
         SELECT customer_email,
                MIN(created_at) AS first_at,
                strftime('%Y-%m', MIN(created_at)) AS cohort_month
         FROM orders
         WHERE customer_email IS NOT NULL
         GROUP BY customer_email
       ),
       cohort_sizes AS (
         SELECT cohort_month, COUNT(*) AS size
         FROM first_order
         GROUP BY cohort_month
         ORDER BY cohort_month DESC
         LIMIT 6
       )
       SELECT cs.cohort_month AS month,
              cs.size,
              (
                SELECT COUNT(DISTINCT fo.customer_email)
                FROM first_order fo
                JOIN orders o ON o.customer_email = fo.customer_email
                WHERE fo.cohort_month = cs.cohort_month
                  AND datetime(o.created_at) > datetime(fo.first_at, '+30 days')
                  AND datetime(o.created_at) <= datetime(fo.first_at, '+60 days')
              ) AS m1_returning
       FROM cohort_sizes cs
       ORDER BY cs.cohort_month ASC`
    )) || {};

  return (results || []).map((row) => {
    const size = Number(row.size || 0);
    const m1 = Number(row.m1_returning || 0);
    const m1Pct = size > 0 ? Math.round((m1 / size) * 100) : 0;
    return {
      month: row.month,
      size,
      retention: [100, m1Pct],
    };
  });
}

export async function getFinanceAnalytics(env, range = "30d") {
  const cfg = rangeConfig(range);
  const sinceModifier = cfg.bucket === "hour" ? "-1 day" : `-${cfg.days} days`;
  const prevModifier =
    cfg.bucket === "hour"
      ? "-2 day"
      : `-${cfg.days * 2} days`;
  const prevEndModifier = cfg.bucket === "hour" ? "-1 day" : `-${cfg.days} days`;

  const [current, previousWindow, revenueSeries, statusMixData, productMixData, aiCosts] =
    await Promise.all([
      periodTotals(env, sinceModifier),
      safeFirst(
        env,
        `SELECT
           COUNT(*) AS orders,
           COALESCE(SUM(total_cents), 0) AS revenue_cents,
           COALESCE(SUM(CASE WHEN status IN ('pending','awaiting_payment') THEN total_cents ELSE 0 END), 0) AS pending_cents
         FROM orders
         WHERE datetime(created_at) >= datetime('now', ?)
           AND datetime(created_at) < datetime('now', ?)`,
        prevModifier,
        prevEndModifier
      ).then(async (row) => {
        const units = await safeFirst(
          env,
          `SELECT COALESCE(SUM(oi.qty), 0) AS units
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE datetime(o.created_at) >= datetime('now', ?)
             AND datetime(o.created_at) < datetime('now', ?)`,
          prevModifier,
          prevEndModifier
        );
        const customers = await safeFirst(
          env,
          `SELECT COUNT(DISTINCT customer_email) AS customers
           FROM orders
           WHERE customer_email IS NOT NULL
             AND datetime(created_at) >= datetime('now', ?)
             AND datetime(created_at) < datetime('now', ?)`,
          prevModifier,
          prevEndModifier
        );
        const orders = Number(row?.orders || 0);
        const revenueCents = Number(row?.revenue_cents || 0);
        return {
          orders,
          revenue_cents: revenueCents,
          pending_cents: Number(row?.pending_cents || 0),
          units: Number(units?.units || 0),
          customers: Number(customers?.customers || 0),
          aov_cents: orders > 0 ? Math.round(revenueCents / orders) : 0,
        };
      }),
      revenueByBucket(env, cfg),
      statusMix(env, sinceModifier),
      productMix(env, sinceModifier),
      aiCostSeries(env, cfg),
    ]);

  const previous = previousWindow || {
    orders: 0,
    revenue_cents: 0,
    pending_cents: 0,
    units: 0,
    customers: 0,
    aov_cents: 0,
  };

  const [spark, unitEconomicsData, recent, cohorts] = await Promise.all([
    orderSparkline(env, cfg.days),
    unitEconomics(env, sinceModifier, current, previous),
    recentOrders(env),
    customerCohorts(env),
  ]);

  const grossRevenue = centsToDollars(current.revenue_cents);
  const statusTotal = statusMixData.reduce((a, b) => a + b.value, 0);
  const productTotal = productMixData.reduce((a, b) => a + b.value, 0);
  const collectedCents = recent
    .filter((o) => o.status === "paid" || o.status === "fulfilled")
    .reduce((a, b) => a + b.amount_cents, 0);
  const pendingCount = recent.filter((o) => o.status === "pending" || o.status === "awaiting_payment").length;

  const aiTotal = aiCosts.ai.reduce((a, b) => a + b, 0);
  const cogsEstimate = revenueSeries.revenue.map((v) => Number((v * 0.35).toFixed(2)));

  return {
    ok: true,
    range: cfg.label,
    refreshed_at: new Date().toISOString(),
    data_source: "d1",
    stripe_connected: Boolean(env.STRIPE_SECRET_KEY),
    kpis: {
      gross_revenue: {
        value: grossRevenue,
        delta: pctDelta(current.revenue_cents, previous.revenue_cents),
        spark,
      },
      orders: {
        value: current.orders,
        delta: pctDelta(current.orders, previous.orders),
        spark: spark.map((v) => (v > 0 ? 1 : 0)),
      },
      avg_order_value: {
        value: centsToDollars(current.aov_cents),
        delta: pctDelta(current.aov_cents, previous.aov_cents),
        spark,
      },
      units_sold: {
        value: current.units,
        delta: pctDelta(current.units, previous.units),
        spark,
      },
    },
    revenue_series: {
      labels: revenueSeries.labels,
      series: [
        {
          name: "Confirmed",
          data: revenueSeries.confirmed,
          color: "oklch(0.68 0.22 285)",
        },
        {
          name: "Pending",
          data: revenueSeries.pending,
          color: "oklch(0.72 0.16 85)",
        },
      ],
    },
    status_mix: statusMixData,
    product_mix: productMixData,
    mix_totals: {
      status: statusTotal,
      product: productTotal,
    },
    unit_economics: unitEconomicsData,
    cost_series: {
      labels: aiCosts.labels,
      series: [
        {
          name: "Est. COGS",
          data: cogsEstimate,
          color: "oklch(0.66 0.18 305)",
        },
        {
          name: "AgentSam AI",
          data: aiCosts.ai,
          color: "oklch(0.78 0.13 220)",
        },
      ],
      ai_pct_of_revenue:
        grossRevenue > 0 ? Number(((aiTotal / grossRevenue) * 100).toFixed(1)) : 0,
      cogs_pct_of_revenue: 35,
    },
    recent_orders: recent,
    recent_orders_summary: {
      collected_cents: collectedCents,
      pending_count: pendingCount,
    },
    customer_cohorts: cohorts,
    totals: {
      revenue_cents: current.revenue_cents,
      orders: current.orders,
      units: current.units,
      customers: current.customers,
      pending_cents: current.pending_cents,
      confirmed_cents: current.confirmed_cents,
    },
  };
}
