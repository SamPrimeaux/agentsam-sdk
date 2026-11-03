import React from "react";
import { KPI } from "@inneranimalmedia/analytics-ui";
import { formatFinancialMetric, selectFinancialMetrics, type FinancialAnalyticsReadModel } from "../index.js";

export function FinancialMetricDeck({ model, locale }: { model: FinancialAnalyticsReadModel; locale?: string }) {
  const definitions = selectFinancialMetrics(model.capabilities);
  const byId = new Map(model.metrics.map((metric) => [metric.id, metric]));
  if (!definitions.length) return <section aria-live="polite"><p>No financial sources are connected yet.</p></section>;
  return <section className="financial-metric-deck" aria-label="Financial metrics">
    {definitions.map((definition) => {
      const metric = byId.get(definition.id);
      return <KPI key={definition.id} label={definition.label}
        value={metric ? formatFinancialMetric(metric, model.currency, locale) : "Unavailable"}
        deltaLabel={metric?.note ?? definition.description} />;
    })}
    <p className="financial-metric-coverage">{model.sources.filter((source) => source.state === "available").length} of {model.sources.length} sources reporting</p>
  </section>;
}
