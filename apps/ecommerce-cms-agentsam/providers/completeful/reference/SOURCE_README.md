# Completeful provider reference

Snapshot captured from the Completeful provider materials supplied for the Fuel & Free Time integration on 2026-09-18.

## Files

- `openapi.json` — machine-readable Completeful Partner API OpenAPI 3.0.3 contract, extracted from the supplied snapshot and JSON-validated before commit.
- `openapi.snapshot.md` — exact Markdown snapshot supplied in the integration conversation, retained verbatim for provenance.
- `reference.snapshot.md` — exact rendered/reference Markdown supplied in the integration conversation.

## Source authority

The provider describes `openapi.json` as the canonical partner contract. Treat this directory as a pinned development snapshot, not as proof that the remote provider has not changed.

Before implementing or changing a Completeful endpoint:

1. Check the pinned `openapi.json`.
2. Prefer explicit `/v1/shops/{shopId}/...` routes for shop-scoped resources.
3. Use `Idempotency-Key` on create/action endpoints.
4. Preserve structured provider errors, especially `code`, `request_id`, `path`, and `remediation`.
5. Use a `capp_test_` key during integration and confirm dry-run response headers before enabling live writes.
6. Keep webhook signing secrets and API keys out of Git, D1, browser code, logs, and AgentSam prompts.

When the provider contract is refreshed, replace all three snapshots together so code review can see exactly what changed.
