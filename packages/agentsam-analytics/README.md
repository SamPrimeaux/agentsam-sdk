# @inneranimalmedia/agentsam-analytics

Portable AgentSam runtime analytics product.

Owns:
- overview
- usage & cost
- performance
- health
- versioned score families

Does not own D1, Basin, authentication, routing, or Cloudflare credentials.
Hosts provide a query API matching the package read-model contract.

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
