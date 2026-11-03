export type FinancialCapability =
  | "transactions" | "sales" | "transaction_categories" | "recurring_revenue"
  | "receivables" | "refunds" | "taxes" | "customers" | "inventory"
  | "usage_costs" | "platform_usage" | "cloud_billing";

export type FinancialMetricId =
  | "income" | "expenses" | "net_cash_flow" | "average_transaction" | "revenue" | "order_count" | "average_sale"
  | "recurring_revenue" | "receivables" | "refunds" | "tax_collected"
  | "customer_lifetime_value" | "inventory_value" | "tracked_usage_cost" | "platform_usage_cost"
  | "cloud_billed_cost";

export type FinancialMetricDefinition = {
  id: FinancialMetricId;
  label: string;
  description: string;
  unit: "currency" | "count";
  requires: FinancialCapability[];
  source: string;
};

export type FinancialMetricValue = {
  id: FinancialMetricId;
  value: number | null;
  unit: "currency" | "count";
  state: "available" | "empty" | "unavailable";
  source: string;
  sampleCount: number;
  note?: string;
};

export type FinancialSourceStatus = {
  id: string;
  label: string;
  state: "available" | "empty" | "unavailable";
  recordCount: number | null;
  latestAt?: string | null;
  reason?: string;
};

export type FinancialAnalyticsReadModel = {
  range: string;
  currency: string;
  generatedAt: string;
  capabilities: FinancialCapability[];
  sources: FinancialSourceStatus[];
  metrics: FinancialMetricValue[];
};

export const FINANCIAL_METRICS: FinancialMetricDefinition[] = [
  { id:"income", label:"Income recorded", description:"Recorded credits or income in the selected period.", unit:"currency", requires:["transactions"], source:"transactions" },
  { id:"expenses", label:"Expenses recorded", description:"Recorded debits or expenses in the selected period.", unit:"currency", requires:["transactions"], source:"transactions" },
  { id:"net_cash_flow", label:"Net cash flow", description:"Recorded income less recorded expenses.", unit:"currency", requires:["transactions"], source:"transactions" },
  { id:"average_transaction", label:"Average transaction", description:"Average recorded transaction amount.", unit:"currency", requires:["transactions"], source:"transactions" },
  { id:"revenue", label:"Revenue", description:"Revenue recorded by a connected sales source.", unit:"currency", requires:["sales"], source:"sales" },
  { id:"order_count", label:"Transactions recorded", description:"Number of sales transactions recorded in the selected period.", unit:"count", requires:["sales"], source:"sales" },
  { id:"average_sale", label:"Average sale", description:"Average value of recorded sales transactions.", unit:"currency", requires:["sales"], source:"sales" },
  { id:"recurring_revenue", label:"Recurring revenue", description:"Recurring revenue reported by a subscription source.", unit:"currency", requires:["recurring_revenue"], source:"subscriptions" },
  { id:"receivables", label:"Open receivables", description:"Unpaid invoice balances reported by an invoice source.", unit:"currency", requires:["receivables"], source:"invoices" },
  { id:"refunds", label:"Refunds", description:"Refund amounts reported by a payment source.", unit:"currency", requires:["refunds"], source:"payments" },
  { id:"tax_collected", label:"Tax collected", description:"Tax amounts reported by a transaction source.", unit:"currency", requires:["taxes"], source:"transactions" },
  { id:"customer_lifetime_value", label:"Customer lifetime value", description:"Lifetime value derived from customer-linked transactions.", unit:"currency", requires:["customers","transactions"], source:"customers" },
  { id:"inventory_value", label:"Inventory value", description:"On-hand inventory valuation reported by an inventory source.", unit:"currency", requires:["inventory"], source:"inventory" },
  { id:"tracked_usage_cost", label:"Tracked usage cost", description:"Usage costs recorded by the host usage ledger.", unit:"currency", requires:["usage_costs"], source:"usage ledger" },
  { id:"platform_usage_cost", label:"Platform usage cost", description:"AgentSam usage cost from a tenant and workspace scoped rollup.", unit:"currency", requires:["platform_usage"], source:"platform usage rollup" },
  { id:"cloud_billed_cost", label:"Cloud billed cost", description:"Invoice-aligned Cloudflare usage charges from a billing source.", unit:"currency", requires:["cloud_billing"], source:"Cloudflare billing" },
];

export function selectFinancialMetrics(capabilities: Iterable<FinancialCapability>): FinancialMetricDefinition[] {
  const available = new Set(capabilities);
  return FINANCIAL_METRICS.filter((metric) => metric.requires.every((capability) => available.has(capability)));
}

export function formatFinancialMetric(metric: FinancialMetricValue, currency = "USD", locale?: string): string {
  if (metric.state === "unavailable") return "Unavailable";
  if (metric.state === "empty" || metric.value == null) return "No records";
  if (metric.unit === "count") return new Intl.NumberFormat(locale).format(metric.value);
  return new Intl.NumberFormat(locale, { style:"currency", currency, maximumFractionDigits:2 }).format(metric.value);
}
