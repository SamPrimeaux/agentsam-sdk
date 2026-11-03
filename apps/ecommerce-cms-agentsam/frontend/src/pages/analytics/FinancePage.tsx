import { useEffect, useState } from "react";
import { FinancialMetricDeck } from "@inneranimalmedia/financial-analytics/ui";
import { fetchFinanceAnalytics } from "../../lib/api";
import type { FinancialAnalyticsReadModel } from "@inneranimalmedia/financial-analytics";
import type { RangeKey } from "../../lib/types";

type PageProps = { range: RangeKey; tenant?: string };

export default function FinancePage({ range }: PageProps) {
  const [data, setData] = useState<FinancialAnalyticsReadModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchFinanceAnalytics(range)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((cause) => { if (!cancelled) setError(cause?.message || "Financial data unavailable"); });
    return () => { cancelled = true; };
  }, [range]);

  if (!data) return <div className="page-head"><div><h1 className="page-title">Finance</h1><p className="page-sub">{error || "Loading financial sources..."}</p></div></div>;

  return <>
    <div className="page-head">
      <div>
        <h1 className="page-title">Finance</h1>
        <p className="page-sub">Capability-driven metrics for {data.range}; refreshed {new Date(data.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      </div>
    </div>
    <FinancialMetricDeck model={data} />
    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div><div className="card-title">Connected financial sources</div><div className="card-sub">Only tenant-scoped, source-backed data contributes to metrics.</div></div>
      </div>
      <div className="card-body col" style={{ gap: 10 }}>
        {data.sources.map((source) => <div key={source.id} className="row-between text-sm">
          <span>{source.label}</span>
          <span className="mono muted">
            {source.state === "available" ? `${source.recordCount ?? 0} records${source.latestAt ? ` · latest ${source.latestAt}` : ""}`
              : source.state === "empty" ? "Connected · no records in this range"
                : source.reason || "Unavailable"}
          </span>
        </div>)}
      </div>
    </section>
  </>;
}
