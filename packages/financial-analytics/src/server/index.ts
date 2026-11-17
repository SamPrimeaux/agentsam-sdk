import type {
  FinancialAnalyticsReadModel,
  FinancialCapability,
  FinancialMetricId,
  FinancialMetricValue,
  FinancialSourceStatus,
} from "../index.js";

type Row = Record<string, unknown>;
type Statement = {
  bind: (...values: Array<string | number | null>) => Statement;
  first: <T = Row>() => Promise<T | null>;
  all: <T = Row>() => Promise<{ results: T[] }>;
};
type Database = { prepare: (sql: string) => Statement };
export type FinancialAnalyticsContext = { db: Database; accountId: string };

const RANGE_SECONDS: Record<string, number | null> = {
  "24h": 86_400,
  "7d": 604_800,
  "30d": 2_592_000,
  "90d": 7_776_000,
  YTD: null,
  All: null,
};
const VALID_TABLES = ["orders", "finance_transactions", "agentsam_tool_call_log"] as const;
type SourceTable = (typeof VALID_TABLES)[number];

const count = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullable = (value: unknown): number | null => value == null ? null : count(value);
const cleanRange = (value: unknown): string => typeof value === "string" && value in RANGE_SECONDS ? value : "30d";

function rangeStart(range: string, nowMs: number): { iso: string; unix: number } {
  if (range === "All") return { iso: "1970-01-01T00:00:00.000Z", unix: 0 };
  if (range === "YTD") {
    const yearStart = Date.UTC(new Date(nowMs).getUTCFullYear(), 0, 1);
    return { iso: new Date(yearStart).toISOString(), unix: Math.floor(yearStart / 1000) };
  }
  const seconds = RANGE_SECONDS[range] || RANGE_SECONDS["30d"]!;
  const start = nowMs - seconds * 1000;
  return { iso: new Date(start).toISOString(), unix: Math.floor(start / 1000) };
}

async function accountScopedTable(db: Database, table: SourceTable): Promise<{ exists: boolean; scoped: boolean }> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<Row>();
  const columns = result.results || [];
  return { exists: columns.length > 0, scoped: columns.some((column) => column.name === "account_id") };
}

async function first(db: Database, sql: string, ...values: Array<string | number | null>): Promise<Row> {
  return (await db.prepare(sql).bind(...values).first<Row>()) || {};
}

function sourceStatus(
  id: string,
  label: string,
  table: { exists: boolean; scoped: boolean },
  countValue: number | null,
  latestAt: string | null,
): FinancialSourceStatus {
  if (!table.exists) return { id, label, state: "unavailable", recordCount: null, reason: "source_not_installed" };
  if (!table.scoped) return { id, label, state: "unavailable", recordCount: null, reason: "account_scope_missing" };
  const records = countValue || 0;
  return { id, label, state: records > 0 ? "available" : "empty", recordCount: records, latestAt };
}

function metric(
  id: FinancialMetricId,
  value: number,
  unit: "currency" | "count",
  source: string,
  sampleCount: number,
): FinancialMetricValue {
  return {
    id,
    value: sampleCount > 0 ? value : null,
    unit,
    state: sampleCount > 0 ? "available" : "empty",
    source,
    sampleCount,
  };
}

function unavailableMetric(
  id: FinancialMetricId,
  unit: "currency" | "count",
  source: string,
  reason: string,
): FinancialMetricValue {
  return { id, value: null, unit, state: "unavailable", source, sampleCount: 0, note: reason };
}

/**
 * Builds the Finance UI read model from real account-owned D1 rows.
 * Session identity is injected by the host; request/query account IDs are never accepted.
 * Tables without an account_id column are deliberately treated as unavailable.
 */
export async function buildFinancialAnalyticsReadModel(
  ctx: FinancialAnalyticsContext,
  rawRange: unknown = "30d",
  nowMs = Date.now(),
): Promise<FinancialAnalyticsReadModel> {
  if (!ctx?.db || typeof ctx.db.prepare !== "function") throw new TypeError("financial_analytics_db_unavailable");
  if (!ctx?.accountId || typeof ctx.accountId !== "string" || !ctx.accountId.trim()) {
    throw Object.assign(new Error("authenticated_account_required"), { status: 401 });
  }

  const range = cleanRange(rawRange);
  const start = rangeStart(range, nowMs);
  const [ordersTable, financeTable, usageTable] = await Promise.all([
    accountScopedTable(ctx.db, "orders"),
    accountScopedTable(ctx.db, "finance_transactions"),
    accountScopedTable(ctx.db, "agentsam_tool_call_log"),
  ]);

  const [orders, finance, usage] = await Promise.all([
    ordersTable.scoped
      ? first(ctx.db, `
          SELECT
            COUNT(*) AS order_count,
            SUM(CASE WHEN status IN ('paid','fulfilled') THEN 1 ELSE 0 END) AS paid_order_count,
            COALESCE(SUM(CASE WHEN status IN ('paid','fulfilled') THEN total_cents ELSE 0 END), 0) AS revenue_cents,
            MAX(created_at) AS latest_at
          FROM orders
          WHERE account_id = ? AND datetime(created_at) >= datetime(?)
        `, ctx.accountId, start.iso)
      : Promise.resolve<Row>({}),
    financeTable.scoped
      ? first(ctx.db, `
          SELECT
            COUNT(*) AS transaction_count,
            COALESCE(SUM(CASE WHEN direction IN ('credit','income') THEN ABS(amount_cents) ELSE 0 END), 0) AS income_cents,
            COALESCE(SUM(CASE WHEN direction IN ('debit','expense') THEN ABS(amount_cents) ELSE 0 END), 0) AS expenses_cents,
            AVG(ABS(amount_cents)) AS average_transaction_cents,
            MAX(date) AS latest_at
          FROM finance_transactions
          WHERE account_id = ? AND is_business = 1 AND datetime(date) >= datetime(?)
        `, ctx.accountId, start.iso)
      : Promise.resolve<Row>({}),
    usageTable.scoped
      ? first(ctx.db, `
          SELECT
            COUNT(*) AS calls,
            SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') AND cost_usd > 0 THEN 1 ELSE 0 END) AS priced_calls,
            COALESCE(SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') THEN cost_usd ELSE 0 END), 0) AS recorded_cost_usd,
            MAX(created_at_unix) AS latest_at
          FROM agentsam_tool_call_log
          WHERE account_id = ? AND created_at_unix >= ?
        `, ctx.accountId, start.unix)
      : Promise.resolve<Row>({}),
  ]);

  const orderCount = count(orders.order_count);
  const paidOrders = count(orders.paid_order_count);
  const revenue = count(orders.revenue_cents) / 100;
  const transactionCount = count(finance.transaction_count);
  const income = count(finance.income_cents) / 100;
  const expenses = count(finance.expenses_cents) / 100;
  const averageTransaction = count(finance.average_transaction_cents) / 100;
  const usageCalls = count(usage.calls);
  const pricedCalls = count(usage.priced_calls);
  const usageCost = count(usage.recorded_cost_usd);
  const latestUsageAt = count(usage.latest_at) > 0 ? new Date(count(usage.latest_at) * 1000).toISOString() : null;

  const capabilities: FinancialCapability[] = [];
  const metrics: FinancialMetricValue[] = [];
  if (financeTable.scoped) {
    capabilities.push("transactions");
    metrics.push(
      metric("income", income, "currency", "finance_transactions", transactionCount),
      metric("expenses", expenses, "currency", "finance_transactions", transactionCount),
      metric("net_cash_flow", income - expenses, "currency", "finance_transactions", transactionCount),
      metric("average_transaction", averageTransaction, "currency", "finance_transactions", transactionCount),
    );
  } else {
    const reason = financeTable.exists ? "account_scope_missing" : "source_not_installed";
    metrics.push(
      unavailableMetric("income", "currency", "finance_transactions", reason),
      unavailableMetric("expenses", "currency", "finance_transactions", reason),
      unavailableMetric("net_cash_flow", "currency", "finance_transactions", reason),
      unavailableMetric("average_transaction", "currency", "finance_transactions", reason),
    );
  }

  if (ordersTable.scoped) {
    capabilities.push("sales");
    metrics.push(
      metric("revenue", revenue, "currency", "orders", paidOrders),
      metric("order_count", orderCount, "count", "orders", orderCount),
      metric("average_sale", paidOrders > 0 ? revenue / paidOrders : 0, "currency", "orders", paidOrders),
    );
  } else {
    const reason = ordersTable.exists ? "account_scope_missing" : "source_not_installed";
    metrics.push(
      unavailableMetric("revenue", "currency", "orders", reason),
      unavailableMetric("order_count", "count", "orders", reason),
      unavailableMetric("average_sale", "currency", "orders", reason),
    );
  }

  if (usageTable.scoped) {
    capabilities.push("usage_costs");
    metrics.push(metric("tracked_usage_cost", usageCost, "currency", "agentsam_tool_call_log", pricedCalls));
  } else {
    const reason = usageTable.exists ? "account_scope_missing" : "source_not_installed";
    metrics.push(unavailableMetric("tracked_usage_cost", "currency", "agentsam_tool_call_log", reason));
  }

  const sources: FinancialSourceStatus[] = [
    sourceStatus("sales_orders", "Sales and orders", ordersTable, orderCount, orders.latest_at == null ? null : String(orders.latest_at)),
    sourceStatus("accounting_transactions", "Accounting transactions", financeTable, transactionCount, finance.latest_at == null ? null : String(finance.latest_at)),
    sourceStatus("agentsam_usage", "AgentSam tool usage", usageTable, usageCalls, latestUsageAt),
  ];

  return {
    range,
    currency: "USD",
    generatedAt: new Date(nowMs).toISOString(),
    capabilities,
    sources,
    metrics,
  };
}
