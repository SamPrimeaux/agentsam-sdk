# AgentSam Plugin Authorization & Resource Authority

Status: **normative v1 boundary / implementation staged**. This document extends, and does not
replace, [PLUGIN-PRODUCTIZATION-SPINE](../../docs/architecture/PLUGIN-PRODUCTIZATION-SPINE.md).
The SDK productization verifier consumes evidence; it is **not** a second OAuth server, MCP
catalog, scanner, or deployment authority.

## Why this contract exists

A plugin product's declared resource URL is **not** itself permission for an OAuth issuer to mint
tokens for that URL. Resource metadata discovery is a protocol fact; resource admission is an
issuer-owned security decision. As of 2026-10-08 the public AgentSam plugin declared
`https://plugins.inneranimalmedia.com/mcp`, while IAM source still admitted older
`workers.dev` resource identifiers. Package tests, UI tests and MCP `tools/list` passed while
production OAuth returned `invalid_resource`. No URL patch in an SDK component can
substitute for cross-service authorization proof.

## Required trust and ownership boundaries

| Fact | Sole authority | Consumers |
| --- | --- | --- |
| Plugin name/version/publisher and included skills | `agentsam.product.json` + packaged plugin definition | Catalog, marketplace, Settings |
| Executable tool names, input/output schemas, annotations, OAuth `securitySchemes` | MCP runtime tool registry | Catalog projection, permissions review, quality receipt |
| Protected-resource URL and advertised issuer | HTTPS MCP protected resource metadata (RFC 9728) | Client discovery, preflight |
| *Approved* resource URI, issuer, allowed scopes, enabled/revoked state | IAM issuer-managed registry | IAM authorize/token, consent, audit |
| OAuth client identity, allowed callbacks and accepted authentication method | IAM OAuth client registration/CIMD validation | OAuth flows |
| Consent grant, token issuance, refresh and revocation | IAM OAuth authority, existing token/grant tables | Resource server, account connections |
| User/provider credentials obtained from outside IAM | SDK Vault/credential registry | Studio host adapters |
| Plugin install and account preferences | Existing Settings / `agentsam_plugins` registry | Web/Desktop UI |
| Current health, real tool execution and readiness | Runtime evidence + productization quality receipt | CLI, UI, release gates |

Do **not** copy issuer tables into the public MCP Worker or create a separate
`AgentSam OAuth` authority. `user_oauth_tokens` stores delegated provider credentials;
IAM-issued access/refresh tokens belong to issuer tables such as `oauth_access_tokens`,
`oauth_refresh_tokens`, `oauth_authorizations`, `oauth_client_grants`.
Existing `agentsam_plugin_oauth_grants` are Studio's resource-bound encrypted connection
observations. Do not merge these three different token roles merely because they all
contain OAuth terminology; first publish a custody/usage migration inventory.

## Resource admission: an issuer-owned registry, not a source constant

Extend IAM, which already has `oauth_clients` and its token-grant authorities, with a **single**
issuer-approved resource registry and resource-scoped permission definitions. The database
names below are proposed schema migrations, not declarations that they already exist:

- `oauth_resource_servers`: exact canonical HTTPS `resource_uri` (unique), approved
  `issuer_uri`, owner/publisher/tenant identity, protected-resource metadata URI,
  approval state (`pending|active|suspended|retired`), review provenance, approved contract
  revision and timestamps. No self-activation by an MCP publisher.
- `oauth_resource_scopes`: FK to approved resource URI, unique `(resource_uri,scope)`,
  human-readable explanation, access class (`read|prepare|write|destructive`), approval
  policy and active/revoked state. A scope absent from the approved resource cannot be
  minted even if the MCP server advertises it.
- Resource-scoped grants must associate **user + OAuth client + resource + granted scopes**
  and be invalidated on revocation or a policy-breaking revision. Evolve the existing grant
  authority in place or via a reconciled migration; do not leave a parallel grant authority.

Canonical HTTPS URI comparison must be deterministic and strict; reject credentials, fragments,
queries, non-HTTPS protocols, unexpected ports, or unknown hosts for public MCP resources.
Do not silently rewrite one host or path into another. Custom domain migrations need an
explicit approved alias/deprecation record and cannot accidentally grant both resources.

IAM `/api/oauth/authorize` and `/api/oauth/token` must resolve the **same** issuer-approved
resource record. It is invalid to accept an audience during authorization but reject it
during token issuance. IAM access-token audience, issuer, expiry, effective scopes and
principal must then be independently checked by the MCP resource server on **each call**.

## Discover, verify, approve; never trust arbitrary metadata

1. Install/discover a plugin **without** granting executable tools or credentials.
2. Fetch the registered HTTPS MCP protected-resource metadata, with bounded response size,
   no cross-origin redirects, SSRF/private-address safeguards, and certificate validation.
3. Compare exact `resource`, acceptable `authorization_servers` and advertised scopes to
   the candidate product, the observed MCP tool descriptors and issuer **policy**.
4. Resolve OAuth authorization-server metadata (RFC 8414): issuer, PKCE S256, endpoints,
   supported client authentication and client identification. Verify issuer trust explicitly.
5. Present the signed-in administrator/operator with a precise resource/scopes diff. Create
   or update the issuer registry only **after** authorized approval, audit and review.
6. Use stable CIMD where supported or reuse an existing approved DCR client instead of
   creating a fresh client for every connection click. Browser/desktop callback URIs must
   be exactly registered, PKCE state one-time, and callback issuer (`iss`, RFC 9207)
   validated where the server supports that protection.
7. Show a consent card from the actual **client** identity, requested **resource**,
   approved scope descriptions, write/destructive risk, and affected account/workspace.
   Hidden or unknown scopes block consent; they are not silently omitted.
8. Mint audience-restricted tokens with exactly approved scopes. Refresh cannot broaden
   scopes. Revocation deactivates credentials and executable tools promptly.
9. Validate the token at MCP invocation and gate action approval by the actual tool
   annotations/policy, not a guessed rule that every non-read tool has equal risk.

Public tool descriptors should publish OAuth `securitySchemes` at the top level and
mirror them in `_meta.securitySchemes` for compatibility. The host must read tool
descriptors from `tools/list` and verify parity with its published catalog; a guessed
marketing `capabilities` list or regex over source code does not prove executability.

## Evidence and promotion: one existing productization engine

For every OAuth-backed plugin, the SDK verifier *implicitly* requires these generic,
non-waivable runtime receipt IDs whether or not an old product manifest lists them:

- `authorization.resource_registered`: issuer has approved exact resource identity.
- `authorization.resource_metadata`: resource and AS metadata agree with issuer policy.
- `authorization.scope_parity`: product/catalog, IAM and runtime agree on approved scopes.
- `authorization.client_registration`: trusted reusable OAuth client and callbacks verified.
- `authorization.token_audience`: actual issued token audience matches resource; negative
  wrong-audience and unauthorized-resource tests also pass.
- `runtime.security_schemes`: live tool descriptor security schemes and approvals reconcile.
- `release.cross_service_compatibility`: deployed IAM, MCP, Studio and account runtime
  versions were exercised together, not merely unit-tested independently.

All such checks require **runtime** evidence. A package-owned `agentsam.quality.json` is a
declaration, not proof of an active OAuth grant, registered resource, user identity,
database round-trip or runtime tool call. `not_applicable` is not a valid waiver for
OAuth-resource acceptance on an OAuth-backed product.

`agentsam plugin inspect|verify|receipt` remains the single consumer and computed READY
authority. Machine/Repository/refinery evidence remains upstream. This contract adds
mandatory receipt requirements; it does **not** duplicate transport discovery, scan or
create another quality-verification engine.

The initial gate checks the presence of runtime receipts, not their cryptographic origin.
**Production graduation additionally requires trusted receipt producers, identity binding,
freshness checks, and signed/attested provenance before any receipt may count as trusted.**
Until those are implemented and verified, the UI must not claim production READY.

## Release and rollback invariants

A deployment is incomplete unless all relevant services pass together. Promotion sequence:

1. Verify product identity and real tool registry against released package content.
2. Prepare and review the issuer resource/scope registration; install the migration and
   reconcile existing issuer data. Never let publication auto-approve a resource.
3. Deploy issuer policy and MCP metadata in a backward-compatible sequence with an explicit
   cutover/rollback plan. A changed origin is not silently treated as the previous resource.
4. From a **fresh account** and fresh plugin installation, prove a read-only OAuth grant,
   real `tools/list`, one permitted tool invocation and denied write attempt.
5. Prove explicit write authorization and per-tool approval; refresh, revoked token,
   wrong issuer/audience, expired token, bad scope, tenant boundary and reconnect cases.
6. Prove browser + desktop use the same canonical identity and resource-bound grant
   without exposing raw tokens to the webview.
7. Capture IAM approval, MCP metadata/tools, Studio connection, tool invocation, D1 receipt
   and deployment SHA. Compute the existing plugin quality receipt.
8. Publish the plugin to the wider catalog **only when** live proof passes; otherwise
   retain `NOT_READY`, an actionable reason and the last verified release.

Failure must show a human-readable error and a correlation ID, never only raw JSON in a
browser. The product page should separate `declared tools`, `authorized tools` and
`verified executable tools`. Report remaining gates; do not display `READY` based on
catalog installation or a successful OAuth redirect alone.

## Explicit anti-patterns

- No plugin-specific resource URL arrays in IAM or Studio source.
- No guessed issuer selected from arbitrary untrusted endpoints.
- No static lists of Brand/Campaign scopes across the SDK, IAM and MCP Worker.
- No DCR per connection click if a reusable trusted client already exists.
- No runtime permission discovery by matching file-text regexes.
- No duplicate credential custody or plaintext refresh-token columns for new writes.
- No fabricated runtime receipts or manually writable `ready`.
- No marking a deploy successful before the deployed SHA and cross-service contract pass.
- No plugin #3 before Brand and Campaign graduate through the same generic, proven path.

## Public specifications followed

- MCP authorization with OAuth 2.1 and RFC 9728 protected-resource metadata.
- RFC 8414 authorization-server metadata, RFC 8707 resource indicators,
  RFC 9207 authorization response issuer protection and S256 PKCE.
- OpenAI Plugin SDK: MCP tool `securitySchemes`, profile identity,
  static plugin packaging, and continuous review of versioned tool contracts.
