/** Account-scoped billing presentation contract; provider credentials never enter this model. */
export type SettingsBillingInvoice = {
  id: string;
  status: string;
  amountPaidMinor: number | null;
  amountDueMinor: number | null;
  currency: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
};
export type SettingsBillingPlan = {
  id: string;
  name: string;
  status: string;
  amountMinor: number | null;
  currency: string | null;
  interval: string | null;
  periodEnd: number | null;
};
export type SettingsBillingSnapshot = {
  state: "ready" | "not_configured" | "unavailable";
  /** An empty billing account is not a balance of zero. */
  plan: SettingsBillingPlan | null;
  invoices: SettingsBillingInvoice[];
  currency: string | null;
  source: string | null;
  updatedAt: string | null;
  message?: string;
};
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
const numberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const stringOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
function verifiedCurrency(value: unknown): string | null {
  const text = stringOrNull(value)?.toUpperCase();
  return text && /^[A-Z]{3}$/.test(text) ? text : null;
}
/** Provider invoice URLs are hyperlinks, never iframe or script sources. */
export function safeBillingUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
/** Maps EXISTING /api/billing and /api/billing/invoices responses; never fabricates amounts. */
export function normalizeBillingApi(
  billing: unknown,
  invoiceResponse: unknown,
): SettingsBillingSnapshot {
  const rows = asRecord(billing)?.subscriptions;
  const invoiceRows = asRecord(invoiceResponse)?.invoices;
  if (!Array.isArray(rows) || !Array.isArray(invoiceRows)) {
    return { state: "unavailable", plan: null, invoices: [], currency: null,
      source: null, updatedAt: null, message: "Billing responses were incomplete." };
  }
  const subscription = rows.map(asRecord).filter((row): row is Record<string, unknown> => !!row)
    .sort((a, b) => (numberOrNull(b.updated_at) ?? 0) - (numberOrNull(a.updated_at) ?? 0))[0];
  const invoices = invoiceRows.map(asRecord).filter((row): row is Record<string, unknown> => !!row)
    .map((row) => ({
      id: stringOrNull(row.id) ?? "",
      status: stringOrNull(row.status) ?? "unknown",
      amountPaidMinor: numberOrNull(row.amount_paid),
      amountDueMinor: numberOrNull(row.amount_due),
      currency: verifiedCurrency(row.currency),
      periodStart: numberOrNull(row.period_start),
      periodEnd: numberOrNull(row.period_end),
      pdfUrl: safeBillingUrl(stringOrNull(row.invoice_pdf)),
      hostedUrl: safeBillingUrl(stringOrNull(row.hosted_invoice_url)),
    })).filter((row) => row.id);
  const plan = subscription ? {
    id: stringOrNull(subscription.plan_id) ?? "",
    name: stringOrNull(subscription.plan_display_name) ?? "Subscription",
    status: stringOrNull(subscription.status) ?? "unknown",
    amountMinor: numberOrNull(subscription.amount_cents),
    currency: verifiedCurrency(subscription.currency),
    interval: stringOrNull(subscription.billing_period),
    periodEnd: numberOrNull(subscription.current_period_end),
  } : null;
  return {
    state: "ready", plan, invoices, currency: verifiedCurrency(asRecord(billing)?.currency), source: "InnerAnimalMedia billing",
    updatedAt: null,
  };
}
export const BILLING_NOT_CONFIGURED: SettingsBillingSnapshot = {
  state: "not_configured", plan: null, invoices: [], currency: null,
  source: null, updatedAt: null, message: "Billing has not been connected for this account.",
};
