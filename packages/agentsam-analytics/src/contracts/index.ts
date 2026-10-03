import type { RangeKey } from "@inneranimalmedia/analytics-ui";

export type AgentSamAnalyticsRange = RangeKey;
export type AgentSamAnalyticsSection =
  | "overview"
  | "usage"
  | "performance"
  | "health"
  | "scores";

export type AnalyticsSummary = {
  total_events: number;
  successful_events: number;
  failed_events: number;
  success_rate: number | null;
  total_cost_usd: number;
  average_duration_ms: number | null;
  total_retries: number;
};

export type AnalyticsTimelinePoint = {
  bucket: string;
  events: number;
  failures: number;
  cost_usd: number;
  duration_ms: number;
};

export type OperationAggregate = {
  domain: string;
  operation: string;
  samples: number;
  successes: number;
  failures: number;
  success_rate: number | null;
  average_duration_ms: number | null;
  max_duration_ms: number | null;
  average_queue_wait_ms: number | null;
  average_external_wait_ms: number | null;
  average_active_model_ms: number | null;
  total_retries: number;
  total_cost_usd: number;
};

export type AgentSamOverviewReadModel = {
  range: AgentSamAnalyticsRange;
  generated_at: string;
  summary: AnalyticsSummary;
  timeline: AnalyticsTimelinePoint[];
  top_operations: OperationAggregate[];
};

export type AgentSamUsageReadModel = {
  range: AgentSamAnalyticsRange;
  generated_at: string;
  totals: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    total_cost_usd: number;
  };
  by_provider_model: Array<{
    provider: string | null;
    model_key: string | null;
    samples: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    total_cost_usd: number;
  }>;
};

export type AgentSamPerformanceReadModel = {
  range: AgentSamAnalyticsRange;
  generated_at: string;
  operations: OperationAggregate[];
};

export type AgentSamHealthReadModel = {
  range: AgentSamAnalyticsRange;
  generated_at: string;
  summary: AnalyticsSummary;
  failure_clusters: Array<{
    domain: string;
    operation: string;
    error_code: string | null;
    failure_origin: string | null;
    failures: number;
  }>;
  recent_failures: Array<{
    id: string;
    domain: string;
    operation: string;
    error_code: string | null;
    failure_origin: string | null;
    artifact_ref: string | null;
    created_at_unix: number;
  }>;
};

export type AgentSamScoresReadModel = {
  range: AgentSamAnalyticsRange;
  generated_at: string;
  families: Array<{
    score_family: string;
    weights_version: string;
    samples: number;
    average_score: number;
    min_score: number;
    max_score: number;
  }>;
};

export type AgentSamAnalyticsReadModels = {
  overview: AgentSamOverviewReadModel;
  usage: AgentSamUsageReadModel;
  performance: AgentSamPerformanceReadModel;
  health: AgentSamHealthReadModel;
  scores: AgentSamScoresReadModel;
};
