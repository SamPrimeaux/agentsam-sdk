# AgentSam error protocol

`error-catalog.json` is the sole authority for the AgentSam failure vocabulary. Run `npm run errors:generate` after changing it; `npm run errors:check` rejects stale JavaScript, TypeScript, Go, Rust, Python, or JSON Schema projections.

## Layering law

Canonical `code` values are the small, stable gRPC-style transport status set. Product detail belongs in orthogonal dimensions:

- `reason`: precise machine cause, including adapter-specific causes such as `hook_http_timeout`, `hook_mcp_timeout`, and `hook_lsp_timeout`;
- `domain` and `failure_class`: ownership and category;
- `stage` plus optional `native_stage`: portable operation phase and subsystem evidence;
- `feature`: open, syntax-validated dotted capability ID;
- `adapter`, `protocol`, and `transport`: distinct delivery layers;
- `failure_behavior`, `retryable`, and `side_effect_state`: what policy did and whether replay is safe;
- source, owner, remediation, redacted native evidence, and fingerprint.

For example, HTTP, MCP, LSP, and command hook timeouts all use `DEADLINE_EXCEEDED` while retaining different reasons and adapter/protocol/transport facts. Do not add combination codes such as `HOOK_MCP_TIMEOUT_CODE`.

Legacy native strings live only as aliases on canonical reasons. Normalizers retain the native value as redacted evidence while emitting the canonical reason. Aliases are a migration bridge, not a second taxonomy.

## Generated outputs

The generator currently owns:

- `packages/agentsam-errors/src/vocabulary.js`
- `packages/agentsam-errors/types/index.d.ts`
- `packages/agentsam-errors/protocol/{error-catalog.json,agentsam.error.v2.schema.json}` for standalone npm artifacts
- `packages/agentsam-contracts/src/errors.ts`
- `protocol/errors/agentsam.error.v2.schema.json`
- `protocol/errors/error-envelope.schema.json` (stable compatibility export)
- `packages/agentsam-hooks/src/errors-generated.js`
- `packages/agentsam-hooks/bindings/go/errors_generated.go`
- `packages/agentsam-hooks/bindings/rust/src/errors_generated.rs`
- `python/agentsam_sdk/errors/vocabulary.py`

Feature IDs are intentionally not a compiled enum. Their dotted syntax is stable while installed apps and tools may introduce new IDs.
