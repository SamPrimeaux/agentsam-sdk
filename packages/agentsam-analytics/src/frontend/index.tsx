import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  KPI,
  RangePicker,
  fmtNum,
  type RangeKey,
} from "@inneranimalmedia/analytics-ui";
import { fetchAgentSamAnalytics } from "../client";
import type {
  AgentSamAnalyticsReadModels,
  AgentSamAnalyticsSection,
} from "../contracts";

const SECTIONS: Array<{ key: AgentSamAnalyticsSection; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "usage", label: "Usage & Cost" },
  { key: "performance", label: "Performance" },
  { key: "health", label: "Health" },
  { key: "scores", label: "Scores" },
];

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

const money = (v: number | null | undefined) =>
  v == null ? "—" : `$${v.toFixed(v < 1 ? 4 : 2)}`;

const ms = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 60_000) return `${(v / 60_000).toFixed(1)}m`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
};

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="aa-table-wrap">
      <table className="aa-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="aa-empty">
                No measured facts in this range yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ data }: { data: AgentSamAnalyticsReadModels["overview"] }) {
  return (
    <>
      <div className="aa-kpis">
        <KPI label="Events" value={fmtNum(data.summary.total_events, { compact: true })} icon="activity" />
        <KPI label="Success rate" value={pct(data.summary.success_rate)} icon="shield" />
        <KPI label="Cost" value={money(data.summary.total_cost_usd)} icon="finance" />
        <KPI label="Avg duration" value={ms(data.summary.average_duration_ms)} icon="clock" />
      </div>

      <div className="aa-grid aa-grid-2">
        <section className="aa-card">
          <div className="aa-card-head">
            <div>
              <h3>Execution activity</h3>
              <p>Normalized AgentSam facts across the selected range.</p>
            </div>
          </div>
          <div className="aa-card-body">
            <AreaChart
              series={[
                {
                  name: "Events",
                  data: data.timeline.map((point) => point.events),
                  color: "var(--aa-accent)",
                },
                {
                  name: "Failures",
                  data: data.timeline.map((point) => point.failures),
                  color: "var(--aa-danger)",
                },
              ]}
              xLabels={data.timeline.map((point) => point.bucket)}
              height={260}
            />
          </div>
        </section>

        <section className="aa-card">
          <div className="aa-card-head">
            <div>
              <h3>Execution posture</h3>
              <p>Mechanical dimensions stay separate instead of one opaque score.</p>
            </div>
          </div>
          <div className="aa-stat-stack">
            <div><span>Successful</span><strong>{fmtNum(data.summary.successful_events)}</strong></div>
            <div><span>Failed</span><strong>{fmtNum(data.summary.failed_events)}</strong></div>
            <div><span>Retries</span><strong>{fmtNum(data.summary.total_retries)}</strong></div>
            <div><span>Cost</span><strong>{money(data.summary.total_cost_usd)}</strong></div>
          </div>
        </section>
      </div>

      <section className="aa-card">
        <div className="aa-card-head">
          <div>
            <h3>Top operations</h3>
            <p>Empirical evidence for routing, GOAP priors, and suspend-vs-poll policy.</p>
          </div>
        </div>
        <DataTable
          columns={["Domain", "Operation", "Samples", "Success", "Avg", "Max", "Retries", "Cost"]}
          rows={data.top_operations.map((row) => [
            row.domain,
            row.operation,
            row.samples,
            pct(row.success_rate),
            ms(row.average_duration_ms),
            ms(row.max_duration_ms),
            row.total_retries,
            money(row.total_cost_usd),
          ])}
        />
      </section>
    </>
  );
}

function Usage({ data }: { data: AgentSamAnalyticsReadModels["usage"] }) {
  const totalTokens =
    data.totals.input_tokens +
    data.totals.cached_input_tokens +
    data.totals.output_tokens +
    data.totals.reasoning_tokens;

  return (
    <>
      <div className="aa-kpis">
        <KPI label="Total tokens" value={fmtNum(totalTokens, { compact: true })} icon="activity" />
        <KPI label="Input" value={fmtNum(data.totals.input_tokens, { compact: true })} />
        <KPI label="Cached input" value={fmtNum(data.totals.cached_input_tokens, { compact: true })} />
        <KPI label="AI cost" value={money(data.totals.total_cost_usd)} icon="finance" />
      </div>
      <section className="aa-card">
        <div className="aa-card-head">
          <div>
            <h3>Provider & model usage</h3>
            <p>Visible cost and token evidence; never hidden routing magic.</p>
          </div>
        </div>
        <DataTable
          columns={["Provider", "Model", "Samples", "Input", "Cached", "Output", "Reasoning", "Cost"]}
          rows={data.by_provider_model.map((row) => [
            row.provider || "unknown",
            row.model_key || "unknown",
            row.samples,
            fmtNum(row.input_tokens, { compact: true }),
            fmtNum(row.cached_input_tokens, { compact: true }),
            fmtNum(row.output_tokens, { compact: true }),
            fmtNum(row.reasoning_tokens, { compact: true }),
            money(row.total_cost_usd),
          ])}
        />
      </section>
    </>
  );
}

function Performance({ data }: { data: AgentSamAnalyticsReadModels["performance"] }) {
  return (
    <section className="aa-card">
      <div className="aa-card-head">
        <div>
          <h3>Operation performance</h3>
          <p>Separate active model, queue, and external wait before changing execution policy.</p>
        </div>
      </div>
      <DataTable
        columns={["Domain", "Operation", "Samples", "Success", "Avg", "Queue", "External", "Model", "Retries", "Cost"]}
        rows={data.operations.map((row) => [
          row.domain,
          row.operation,
          row.samples,
          pct(row.success_rate),
          ms(row.average_duration_ms),
          ms(row.average_queue_wait_ms),
          ms(row.average_external_wait_ms),
          ms(row.average_active_model_ms),
          row.total_retries,
          money(row.total_cost_usd),
        ])}
      />
    </section>
  );
}

function Health({ data }: { data: AgentSamAnalyticsReadModels["health"] }) {
  return (
    <>
      <div className="aa-kpis">
        <KPI label="Success rate" value={pct(data.summary.success_rate)} icon="shield" />
        <KPI label="Failures" value={fmtNum(data.summary.failed_events)} icon="flag" />
        <KPI label="Avg duration" value={ms(data.summary.average_duration_ms)} icon="clock" />
        <KPI label="Retries" value={fmtNum(data.summary.total_retries)} icon="refresh" />
      </div>

      <div className="aa-grid aa-grid-2">
        <section className="aa-card">
          <div className="aa-card-head">
            <div>
              <h3>Failure clusters</h3>
              <p>Recurring failure points worth preflighting or teaching around.</p>
            </div>
          </div>
          <DataTable
            columns={["Domain", "Operation", "Error", "Origin", "Failures"]}
            rows={data.failure_clusters.map((row) => [
              row.domain,
              row.operation,
              row.error_code || "—",
              row.failure_origin || "—",
              row.failures,
            ])}
          />
        </section>

        <section className="aa-card">
          <div className="aa-card-head">
            <div>
              <h3>Recent failures</h3>
              <p>Bulky evidence remains behind artifact references.</p>
            </div>
          </div>
          <DataTable
            columns={["Operation", "Error", "Origin", "Artifact", "Time"]}
            rows={data.recent_failures.map((row) => [
              `${row.domain}.${row.operation}`,
              row.error_code || "—",
              row.failure_origin || "—",
              row.artifact_ref || "—",
              new Date(row.created_at_unix * 1000).toLocaleString(),
            ])}
          />
        </section>
      </div>
    </>
  );
}

function Scores({ data }: { data: AgentSamAnalyticsReadModels["scores"] }) {
  return (
    <section className="aa-card">
      <div className="aa-card-head">
        <div>
          <h3>Versioned score families</h3>
          <p>Raw facts are immutable; scores remain recomputable interpretations.</p>
        </div>
      </div>
      <DataTable
        columns={["Family", "Weights", "Samples", "Average", "Min", "Max"]}
        rows={data.families.map((row) => [
          row.score_family,
          row.weights_version,
          row.samples,
          row.average_score.toFixed(3),
          row.min_score.toFixed(3),
          row.max_score.toFixed(3),
        ])}
      />
    </section>
  );
}

export function AgentSamAnalyticsPage({ baseUrl = "" }: { baseUrl?: string }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [section, setSection] = useState<AgentSamAnalyticsSection>("overview");
  const [loaded, setLoaded] = useState<Partial<AgentSamAnalyticsReadModels>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    fetchAgentSamAnalytics(section, range, {
      baseUrl,
      signal: controller.signal,
    })
      .then((data) => {
        setLoaded((previous) => ({ ...previous, [section]: data }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(String(cause?.message || cause));
        }
      });

    return () => controller.abort();
  }, [baseUrl, range, section]);

  const body = useMemo(() => {
    const data = loaded[section];
    if (!data) return <div className="aa-loading">Loading measured facts…</div>;

    if (section === "overview") {
      return <Overview data={data as AgentSamAnalyticsReadModels["overview"]} />;
    }
    if (section === "usage") {
      return <Usage data={data as AgentSamAnalyticsReadModels["usage"]} />;
    }
    if (section === "performance") {
      return <Performance data={data as AgentSamAnalyticsReadModels["performance"]} />;
    }
    if (section === "health") {
      return <Health data={data as AgentSamAnalyticsReadModels["health"]} />;
    }
    return <Scores data={data as AgentSamAnalyticsReadModels["scores"]} />;
  }, [loaded, section]);

  return (
    <div className="aa-shell">
      <header className="aa-page-head">
        <div>
          <h1>Analytics</h1>
          <p>Execution, cost, timing, health, and versioned score evidence.</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <nav className="aa-tabs" aria-label="AgentSam analytics">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={section === item.key ? "active" : ""}
            onClick={() => setSection(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <div className="aa-alert aa-alert-error">{error}</div>}
      {body}
    </div>
  );
}
