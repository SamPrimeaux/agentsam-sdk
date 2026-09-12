# Cloudflare errors and observability

## Error evidence contract

When an operation fails, retain the most specific machine evidence available:

```text
source/provider
operation
process exit code or HTTP status
machine error type
machine error code
request id / cf-ray when present
retry-after and retry classification
requested vs resolved processing/runtime mode when relevant
bounded redacted response body or stderr
```

Do not flatten this to `request failed`, `429`, `500`, or `Wrangler failed` when richer evidence exists.

## Retry discipline

Retry only failures that can plausibly recover without changing operator state. Rate limits, ramp-rate throttles, overload, and transient provider 5xx errors may be retryable. Authentication, invalid arguments, billing/spend limits, unsupported regions, and missing permissions require configuration or operator action instead of retry loops.

## Worker telemetry

Use production Workers metrics/logs/traces for live evidence. Tail Workers and diagnostics channels can carry structured diagnostic events, but observability itself consumes resources and should remain bounded. Prefer structured fields and stable trace/request IDs over giant free-form logs.

Unhandled promise rejections are runtime evidence and should be surfaced with the rejection reason/trace while redacting secrets.
