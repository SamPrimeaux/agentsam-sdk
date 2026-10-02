export type RangeKey = "24h" | "7d" | "30d" | "90d" | "YTD" | "All";

export type ChartSeries = {
  name: string;
  data: number[];
  color: string;
};

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

export type FinanceAnalyticsResponse = {
  ok: boolean;
  range: string;
  refreshed_at: string;
  data_source: string;
  stripe_connected: boolean;
  kpis: {
    gross_revenue: { value: number; delta: number; spark: number[] };
    orders: { value: number; delta: number; spark: number[] };
    avg_order_value: { value: number; delta: number; spark: number[] };
    units_sold: { value: number; delta: number; spark: number[] };
  };
  revenue_series: {
    labels: string[];
    series: ChartSeries[];
  };
  status_mix: DonutSlice[];
  product_mix: (DonutSlice & { units?: number })[];
  mix_totals: { status: number; product: number };
  unit_economics: Array<{
    label: string;
    value: string;
    delta: number;
    good: boolean;
    hint?: string;
  }>;
  cost_series: {
    labels: string[];
    series: ChartSeries[];
    ai_pct_of_revenue: number;
    cogs_pct_of_revenue: number;
  };
  recent_orders: Array<{
    id: string;
    customer: string;
    date: string;
    method: string;
    amount_cents: number;
    status: string;
  }>;
  recent_orders_summary: { collected_cents: number; pending_count: number };
  customer_cohorts: Array<{ month: string; size: number; retention: number[] }>;
  totals: {
    revenue_cents: number;
    orders: number;
    units: number;
    customers: number;
    pending_cents: number;
    confirmed_cents: number;
  };
};
