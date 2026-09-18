# Platform runtime event dependency

Status: **SDK consumer ready; platform producer pending.**

The standalone CLI does not depend on a platform event endpoint. Local/provider execution emits runtime events directly into the same presenter used by future platform-connected sessions.

The cross-repo dependency is in `SamPrimeaux/inneranimalmedia`: its pending agent-runtime SSE/event channel must eventually deliver the same normalized envelope consumed by:

`src/ui/cli/runtime-events.js -> normalizeRuntimeEventEnvelope()`

The SDK intentionally does **not** invent a route such as `/api/sdk/agent/runs`. Endpoint ownership, authorization, reconnection, and SSE lifecycle belong to the platform repository.

## Producer contract

Each platform event delivered to the SDK must normalize to:

```js
{
  schema_version: 1,
  type: "tool.started",
  timestamp: "2026-09-18T00:00:00.000Z",
  run_id: "run_...",
  sequence: 3,
  payload: {
    // event-specific data
  }
}
```

`run_id` and `sequence` are optional when the source cannot supply them. `type` is required. `payload` is always normalized to an object.

The SDK adds the internal contract marker `schema: "agentsam-runtime-event-v1"` after normalization. Platform producers do not need to know about CLI rendering, spinners, plans, approval prompts, compaction UI, or footer layout. They only emit the envelope.

Current event vocabulary is declared in `src/telemetry/events.js`, including model, usage, cost, context, tool, approval, plan/task, timer, waiting-input, error, and run lifecycle events.

## Boundary

Standalone completion is not blocked by this dependency.

The release-blocking standalone path is:

provider/local runtime -> AgentEvent -> normalizeRuntimeEventEnvelope -> CLI presenter

The later platform-connected path should be:

platform runtime -> SSE/WebSocket transport -> normalizeRuntimeEventEnvelope -> same CLI presenter

If platform integration requires changing the presenter contract instead of only adding the transport connection, treat that as a contract regression.
