# @inneranimalmedia/agentsam-analytics

Portable AgentSam runtime analytics product.

Owns:
- overview
- usage & cost
- performance
- health
- versioned score families

Owns the portable, account-scoped D1 and Basin **read-query contracts** in
`@inneranimalmedia/agentsam-analytics/server`. It does **not** own the D1
database binding, Basin catalog, identity provider, OAuth token store or routes.
Hosts mount the package and supply the verified session account, scoped D1
binding and (if connected) a Cloudflare Basin executor.

No account or Cloudflare resource IDs are embedded into the npm artifact:
install the package once; each user signs in and optionally connects their
own Cloudflare account at runtime. A Cloudflare **sign-in** alone is not a
Basin SQL grant. The Cloudflare connector must resolve an explicit user-owned
grant with Basin SQL, Basin Catalog and R2 read permissions, and reject missing
or mismatched account credentials. Never silently use a deployment-wide token.

```ts
import { handleAnalyticsQueryRequest } from "@inneranimalmedia/agentsam-analytics/server";
// The host must resolve accountId from a VERIFIED login session.
const result = await handleAnalyticsQueryRequest(request, {
  db: env.DB,
  accountId: verifiedSession.accountId,
});
// Return result.status and result.body as an authenticated, no-store response.
```

`queryScopedBasinActivity` only issues fixed SELECT aggregations with a
required internal account ID. Its `execute` callback is supplied by the
Cloudflare connector after resolving **that same user's** authorized catalog
and credential. This module does not fetch or accept provider credentials
from the browser. Never allow browser-supplied SQL, account IDs, catalog names,
or an `authMode: "auto"` environment-token fallback into this path.

These server contracts protect reads; they are not evidence that an actual
agent/tool/deploy emitter has been installed, that the Basin stream has rows,
or that any host has mounted the new exported entrypoint. Verify those
individually before claiming a live analytics feature.

Commerce remains independently first-class in
`@inneranimalmedia/commerce-analytics`.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).

## Source-backed infrastructure and repository-quality telemetry (October 2026)

The `operations.ts` module now owns the portable, provider-neutral contracts:
`OperationEvent`, `InfrastructureHealthReadModel`, `BasinCapability`,
`RepositoryQualityReadModel`, and the deterministic
`serializeOperationEvent` / `recordOperation` Workers Analytics Engine writer.

`recordOperation` writes a schema-versioned, fixed positional
`index`/`blobs`/`doubles` event without prompts, messages, credentials,
customer details, or arbitrary metadata. Workspace identity is the sampling
index. A missing binding is explicitly reported as `recorded:false`.

`InfrastructureHealthReadModel` requires per-source availability. Missing
native Cloudflare metrics, D1 operation events, repository audit receipts,
or Basin provider discovery must stay null/unavailable in client UIs.

Do **not** treat the presence of a package/repository contract as successful
runtime telemetry. Repository drift and failure receipts should be produced
from the existing `@inneranimalmedia/agentsam-repository` graph/contract
authority and canonical errors, then recorded through this event contract.

Provider-specific Analytics SQL and Basin querying belongs to
`@inneranimalmedia/agentsam-connector-cloudflare`, never inside a React
component or a merchant-specific analytics implementation.

## Account-first operational tool metrics (v2.6.14)

The Tools tab is backed by the authenticated-account endpoint
\`GET /api/analytics/tool-usage?range=30d\`. The host never accepts an account ID
from the browser's query/body; it binds the session owner to each D1 query.

Source of truth: \`agentsam_tool_call_log\`, grouped by tool and day. Existing
\`idx_tool_call_account_time\` supports scoped reads. Metrics include recorded calls,
success/failure counts, duration, cache hits and **recorded** costs. Unrecorded
executions, model cost or absent provider data are not inferred.

Existing \`agentsam_analytics\` is a separate normalized stream with different
coverage. Do not substitute its low event count for the actual number of tool calls.
Do not read \`agentsam_tool_stats_compacted\` until its compactor is demonstrably
populated. All metrics remain D1-backed, not mock fixtures.
