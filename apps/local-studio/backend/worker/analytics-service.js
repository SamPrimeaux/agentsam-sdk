const ANALYTICS_SCHEMA = "agentsam.metric-event.v1";
const MAX_JSON_FIELD_BYTES = 4096;
const MAX_EVENT_BYTES = 16 * 1024;
const MAX_STRING_CHARS = 512;

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "source_tree",
  "source_code",
  "stack_trace",
  "stacktrace",
  "prompt",
  "prompt_body",
  "response_body",
  "image",
  "image_blob",
  "binary",
  "blob",
  "receipt",
  "full_receipt",
  "transcript",
]);

const INT64_FIELDS = [
  "duration_ms",
  "queue_wait_ms",
  "external_wait_ms",
  "active_model_ms",
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_tokens",
];

const NONNEGATIVE_NUMBER_FIELDS = [
  ...INT64_FIELDS,
  "cost_usd",
  "attempt_count",
  "retry_count",
];

const SMALL_STRING_FIELDS = [
  "account_id",
  "tenant_id",
  "workspace_id",
  "repository_id",
  "git_sha",
  "run_id",
  "receipt_id",
  "event_kind",
  "domain",
  "operation",
  "outcome",
  "source_client",
  "source_table",
  "source_id",
  "provider",
  "model_key",
  "tool_key",
  "cost_basis",
  "score_family",
  "weights_version",
  "error_code",
  "failure_origin",
  "artifact_ref",
  "dedup_key",
];

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function assertSmallString(name, value) {
  if (value == null) return null;
  const text = String(value);
  if (text.length > MAX_STRING_CHARS) {
    throw new TypeError(`${name} exceeds ${MAX_STRING_CHARS} characters`);
  }
  return text;
}

function assertNoForbiddenKeys(value, path = "", depth = 0) {
  if (value == null || typeof value !== "object") return;
  if (depth > 6) throw new TypeError(`${path || "payload"} nesting is too deep`);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertNoForbiddenKeys(value[i], `${path}[${i}]`, depth + 1);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = String(key).toLowerCase();
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalized)) {
      throw new TypeError(
        `${path ? `${path}.` : ""}${key} is not allowed in analytics; store bulky evidence behind artifact_ref`,
      );
    }
    assertNoForbiddenKeys(child, path ? `${path}.${key}` : key, depth + 1);
  }
}

function normalizeBoundedJson(name, value) {
  const normalized = value == null ? {} : value;
  if (typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new TypeError(`${name} must be a JSON object`);
  }

  assertNoForbiddenKeys(normalized, name);

  const encoded = JSON.stringify(normalized);
  if (byteLength(encoded) > MAX_JSON_FIELD_BYTES) {
    throw new TypeError(
      `${name} exceeds ${MAX_JSON_FIELD_BYTES} bytes; project smaller analytical facts`,
    );
  }
  return normalized;
}

function normalizeNonnegativeNumber(name, value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${name} must be a finite number >= 0`);
  }
  return number;
}

function normalizeOptionalNumber(name, value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return number;
}

function streamInt64(value) {
  return value == null ? undefined : String(Math.trunc(value));
}

export function validateAnalyticsFact(input = {}) {
  const fact = {
    id: assertSmallString("id", input.id || `aev_${crypto.randomUUID().replaceAll("-", "")}`),
    schema_name: ANALYTICS_SCHEMA,
    created_at_unix: Math.floor(
      normalizeNonnegativeNumber(
        "created_at_unix",
        input.created_at_unix ?? Date.now() / 1000,
      ),
    ),
    dimensions: normalizeBoundedJson("dimensions", input.dimensions),
    metrics: normalizeBoundedJson("metrics", input.metrics),
  };

  for (const field of SMALL_STRING_FIELDS) {
    fact[field] = assertSmallString(field, input[field]);
  }

  for (const field of NONNEGATIVE_NUMBER_FIELDS) {
    fact[field] = normalizeNonnegativeNumber(field, input[field]);
  }

  fact.plan_points = normalizeOptionalNumber("plan_points", input.plan_points);
  fact.score_value = normalizeOptionalNumber("score_value", input.score_value);

  if (!fact.event_kind || !fact.domain || !fact.operation) {
    throw new TypeError("event_kind, domain, and operation are required");
  }

  if (fact.score_value != null && !fact.score_family) {
    throw new TypeError("score_value requires score_family");
  }

  if (fact.score_family && !fact.weights_version) {
    throw new TypeError("score_family requires weights_version");
  }

  const streamRecord = toAnalyticsStreamRecord(fact);
  const eventBytes = byteLength(JSON.stringify(streamRecord));
  if (eventBytes > MAX_EVENT_BYTES) {
    throw new TypeError(
      `analytics event is ${eventBytes} bytes; max is ${MAX_EVENT_BYTES}; use artifact_ref for bulky evidence`,
    );
  }

  return fact;
}

export function toAnalyticsStreamRecord(fact) {
  const record = {
    event_id: fact.id,
    schema: fact.schema_name,
    occurred_at: fact.created_at_unix * 1000,
    event_kind: fact.event_kind,
    domain: fact.domain,
    operation: fact.operation,
  };

  const direct = [
    "outcome",
    "account_id",
    "tenant_id",
    "workspace_id",
    "repository_id",
    "git_sha",
    "run_id",
    "receipt_id",
    "source_client",
    "source_table",
    "source_id",
    "provider",
    "tool_key",
    "cost_usd",
    "attempt_count",
    "retry_count",
    "plan_points",
    "score_family",
    "score_value",
    "weights_version",
    "error_code",
    "failure_origin",
    "artifact_ref",
  ];

  for (const field of direct) {
    if (fact[field] != null) record[field] = fact[field];
  }

  if (fact.model_key != null) record.model = fact.model_key;

  for (const field of INT64_FIELDS) {
    if (fact[field] != null) record[field] = streamInt64(fact[field]);
  }

  if (Object.keys(fact.dimensions).length) record.dimensions = fact.dimensions;
  if (Object.keys(fact.metrics).length) record.metrics = fact.metrics;

  return record;
}

const INSERT_SQL = `
INSERT INTO agentsam_analytics (
  id, schema_name,
  account_id, tenant_id, workspace_id, repository_id, git_sha, run_id, receipt_id,
  event_kind, domain, operation, outcome,
  source_client, source_table, source_id, provider, model_key, tool_key,
  duration_ms, queue_wait_ms, external_wait_ms, active_model_ms,
  input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, cost_usd, cost_basis,
  attempt_count, retry_count, plan_points,
  score_family, score_value, weights_version,
  error_code, failure_origin, artifact_ref,
  dimensions_json, metrics_json, dedup_key, created_at_unix
) VALUES (
  ?, ?,
  ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?
)
`;

function analyticsBindings(fact) {
  return [
    fact.id,
    fact.schema_name,
    fact.account_id,
    fact.tenant_id,
    fact.workspace_id,
    fact.repository_id,
    fact.git_sha,
    fact.run_id,
    fact.receipt_id,
    fact.event_kind,
    fact.domain,
    fact.operation,
    fact.outcome,
    fact.source_client,
    fact.source_table,
    fact.source_id,
    fact.provider,
    fact.model_key,
    fact.tool_key,
    fact.duration_ms,
    fact.queue_wait_ms,
    fact.external_wait_ms,
    fact.active_model_ms,
    fact.input_tokens,
    fact.cached_input_tokens,
    fact.output_tokens,
    fact.reasoning_tokens,
    fact.cost_usd,
    fact.cost_basis,
    fact.attempt_count,
    fact.retry_count,
    fact.plan_points,
    fact.score_family,
    fact.score_value,
    fact.weights_version,
    fact.error_code,
    fact.failure_origin,
    fact.artifact_ref,
    JSON.stringify(fact.dimensions),
    JSON.stringify(fact.metrics),
    fact.dedup_key,
    fact.created_at_unix,
  ];
}

export async function emitAnalyticsFact(env, input) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    throw new TypeError("analytics DB binding unavailable");
  }

  const fact = validateAnalyticsFact(input);

  await env.DB.prepare(INSERT_SQL)
    .bind(...analyticsBindings(fact))
    .run();

  const streamRecord = toAnalyticsStreamRecord(fact);
  let basin = { ok: false, skipped: "binding_unavailable" };

  if (env.AGENTSAM_ACTIVITY && typeof env.AGENTSAM_ACTIVITY.send === "function") {
    try {
      await env.AGENTSAM_ACTIVITY.send([streamRecord]);
      basin = { ok: true };
    } catch (error) {
      basin = {
        ok: false,
        error: String(error?.message || error).slice(0, 240),
      };
      console.warn("analytics_basin_projection_failed", {
        event_id: fact.id,
        domain: fact.domain,
        operation: fact.operation,
        error: basin.error,
      });
    }
  }

  return {
    id: fact.id,
    schema: fact.schema_name,
    created_at_unix: fact.created_at_unix,
    basin,
  };
}
