# Cloudflare Queues observability — AgentSam

This is an in-place integration of existing Queues and the existing AgentSam Workbench widget. It never creates, purges, acknowledges, or changes a queue.

## Queue inventory status

The Cloudflare account dashboard screenshot dated 2026-10-31 showed six queues:

| Queue name | Dashboard status at capture | Confirmed queue ID | Producer / consumer / DLQ |
| --- | --- | --- | --- |
| `74b3155b36334b69852411c083d50322` | Active | Pending API verification | Pending API verification |
| `fnf-asset-jobs` | Active | Pending API verification | Pending API verification |
| `inneranimalmedia` | Inactive | Pending API verification | Pending API verification |
| `innerautodidact-mcp` | Inactive | Pending API verification | Pending API verification |
| `meauxwork-jobs` | Inactive | Pending API verification | Pending API verification |
| `my-queue-dlq` | Inactive | Pending API verification | Pending API verification |

The screenshot exposes only truncated IDs. Queue name, inferred product name, and Worker binding name are **not** adequate proofs of the owning application. In particular, the first queue's name resembles the displayed ID of `inneranimalmedia`. Verify both from the account API rather than merging them.

To complete the inventory, call the authenticated endpoint after deploy. It queries the live Cloudflare inventory and each queue's details and reads the real-time metrics endpoint, without creating any new queues.

## Backend interface

`GET /api/queues/observability`

Returns the Cloudflare account's existing physical queues with:
- `queue_id`, `queue_name`, delivery state, `environment`, `owner_app`
- Producer bindings and configured Worker/pull consumers
- Consumer retry/batch/concurrency settings and dead-letter destinations
- `metrics.state` plus backlog count/bytes and oldest timestamp

`GET /api/queues/observability?queue_id=<verified queue id>&history=24h`

Returns the same inventory plus hourly GraphQL queue-backlog history for the selected queue. If GraphQL fails, `history.state` is `unavailable`; it is **never** represented as zero.

The endpoint must **not** return API tokens, raw message bodies, or other accounts' data. All access is restricted to verified Studio sessions explicitly listed in the operator allowlist. It is read-only; message peek/purge/ack do not belong in this dashboard.

## Required Worker configuration

- `CLOUDFLARE_ACCOUNT_ID`: already configured in `apps/local-studio/backend/wrangler.jsonc`.
- `CLOUDFLARE_API_TOKEN`: a **server-side Worker secret** scoped to Cloudflare Queues Read / Workers Scripts Read and GraphQL Analytics if history is enabled. Never add this token to source control or public variables.
- `QUEUE_OBSERVABILITY_ADMIN_IDS`: comma-separated **account IDs** permitted to view the *whole Cloudflare account's* topology; missing/empty means 403 for every user, deliberately.
- `QUEUE_OBSERVABILITY_OWNERS_JSON`: optional JSON map from exact physical queue name to verified `{ "owner_app": "...", "environment": "..." }`. Unknown ownership remains null, rather than guessed from names.

A regular signed-in account is not an operator. In a future BYOK installation, credentials and visibility must be scoped to the connected customer's own Cloudflare account; do not reuse this operator endpoint for all tenants.

## Validation and rollout

1. Verify production queue inventory names, IDs, producer scripts, consumer scripts, DLQ targets, environment and ownership by using the protected endpoint with an authorized account.
2. Check one real zero and one non-zero metric. Read failures must appear as `unavailable`, not as a fabricated zero.
3. Compare the endpoint's list/metrics with the Cloudflare dashboard. Cloudflare point-in-time metrics are approximate.
4. Verify `/settings/customize?view=widgets` loads the existing live Queue Depth widget, permits physical queue selection in its detail dialog, and shows 24h history or an explicit unavailable state.
5. Verify unauthenticated 401, signed-in nonoperator 403, missing token 503 and disabled analytics with safe empty states.
6. Run `node --test packages/agentsam-queue-control/test/*.test.mjs apps/local-studio/scripts/studio-queue-observability.test.mjs`, build Workbench/Settings, then run the normal Studio Worker dry run and authenticated smoke checks.
7. Only after checks pass, deploy the existing `agentsam-sdk` Worker through its established release pipeline and verify the real authenticated URL. Do not create an additional Worker or queue.

## Sources

Cloudflare API: https://developers.cloudflare.com/api/resources/queues/methods/list/
Cloudflare per-queue metrics: https://developers.cloudflare.com/api/resources/queues/methods/get_metrics/
Consumer API: https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/list/
History fields: https://developers.cloudflare.com/queues/observability/metrics/

**Not yet included:** AgentSam logical job status correlation (which needs `agentsam_queue_job` migration/reconciliation), cross-account BYOK management, privileged message operations.
