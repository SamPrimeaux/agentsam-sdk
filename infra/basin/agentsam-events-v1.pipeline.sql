INSERT INTO agentsam_events_v1_sink
SELECT
  event_id,
  schema,
  occurred_at,

  event_kind,
  domain,
  operation,
  outcome,

  account_id,
  tenant_id,
  workspace_id,
  repository_id,
  git_sha,
  run_id,
  receipt_id,

  source_client,
  source_table,
  source_id,

  provider,
  model,
  tool_key,

  duration_ms,
  queue_wait_ms,
  external_wait_ms,
  active_model_ms,

  input_tokens,
  cached_input_tokens,
  output_tokens,
  reasoning_tokens,
  cost_usd,

  attempt_count,
  retry_count,
  plan_points,

  score_family,
  score_value,
  weights_version,

  error_code,
  failure_origin,

  artifact_ref,
  dimensions,
  metrics
FROM agentsam_activity_v1;
