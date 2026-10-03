/**
 * Commerce remains a first-class analytics domain.
 *
 * These contracts intentionally do not inherit AgentSam runtime analytics.
 * Shared visual primitives are allowed; business meaning remains commerce-owned.
 */

export type CommerceAnalyticsRange =
  | "24h"
  | "7d"
  | "30d"
  | "90d"
  | "YTD"
  | "All";

export type CommerceFinanceReadModel = {
  range: CommerceAnalyticsRange;
  generated_at: string;
  gross_revenue: number;
  orders: number;
  average_order_value: number;
  units_sold: number;
  unique_customers?: number;
  repeat_customer_rate?: number;
  pending_order_share?: number;
  newsletter_subscribers?: number;
  estimated_cogs_usd?: number;
  estimated_gross_margin?: number;

  /** AI spend attributable to commerce work in this range. */
  agentsam_ai_cost_usd?: number;

  revenue_series: Array<{
    bucket: string;
    confirmed: number;
    pending: number;
    refunded?: number;
  }>;

  product_mix: Array<{
    product_id: string;
    product_name: string;
    revenue: number;
    units: number;
    share: number;
  }>;
};

export type CommerceOverviewReadModel = {
  range: CommerceAnalyticsRange;
  generated_at: string;
  active_users?: number;
  requests_per_minute?: number;
  mrr?: number;
  error_rate?: number;
  conversion_funnel?: Array<{
    key: string;
    label: string;
    count: number;
    conversion_from_previous?: number;
  }>;
  geographic_distribution?: Array<{
    country: string;
    active_users: number;
  }>;
  activity_heatmap?: Array<{
    weekday: number;
    hour: number;
    value: number;
  }>;
};

export type CommerceHealthState =
  | "operational"
  | "degraded"
  | "down"
  | "unknown";

export type CommerceHealthReadModel = {
  range: CommerceAnalyticsRange;
  generated_at: string;
  uptime?: number;
  p99_ms?: number;
  error_rate?: number;
  throughput?: number;
  services: Array<{
    key: string;
    label: string;
    provider?: string;
    uptime?: number;
    p99_ms?: number;
    requests_per_second?: number;
    errors?: number;
    status: CommerceHealthState;
  }>;
  incidents?: Array<{
    id: string;
    severity: "P1" | "P2" | "P3" | "P4";
    title: string;
    service?: string;
    status: string;
    occurred_at: string;
  }>;
};
