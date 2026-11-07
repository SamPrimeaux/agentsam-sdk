/** Account-owned, source-verified tool usage. Not a provider invoice or complete model spend. */
export type SettingsToolUsageReceipt = {
  schema: "agentsam.tool-usage.v2";
  scope: "authenticated_account";
  range: string;
  source: string;
  coverage: { measured_calls: number };
  totals: { calls: number; priced_calls: number; recorded_cost_usd: number };
};

const obj = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number =>
  finite(value) && Number.isInteger(value) && value >= 0;

export function normalizeVerifiedToolUsage(value: unknown): {
  label: string; value: string; detail: string
}[] {
  const data = obj(value);
  if (data?.schema !== "agentsam.tool-usage.v2" ||
    data.scope !== "authenticated_account" ||
    data.source !== "agentsam_tool_call_log" || data.range !== "30d") return [];
  const coverage = obj(data.coverage);
  const totals = obj(data.totals);
  const recorded = coverage?.measured_calls;
  const calls = totals?.calls;
  const priced = totals?.priced_calls;
  const cost = totals?.recorded_cost_usd;
  if (!count(recorded) || !count(calls) || !count(priced) ||
    !finite(cost) || cost < 0 || priced > recorded || calls !== recorded) return [];

  const money = priced > 0
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cost)
    : "Not recorded";
  const coverageText = recorded === 0 ? "No tool calls recorded in this period."
    : priced === recorded
      ? "All recorded tool calls have a cost field."
      : `Costs recorded for ${priced} of ${recorded} tool calls.`;
  return [
    { label: "Recorded tool costs", value: money,
      detail: `Last 30 days · ${coverageText} Excludes provider invoices and untracked model costs.` },
    { label: "Tool calls", value: new Intl.NumberFormat().format(recorded),
      detail: "Last 30 days · Authenticated account tool receipts" },
  ];
}
