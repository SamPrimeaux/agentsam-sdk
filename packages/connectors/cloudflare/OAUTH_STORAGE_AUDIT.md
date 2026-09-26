# Cloudflare connector — OAuth storage audit (Phase A)

## Do not expand

- `agentsam_cloudflare_connections` — legacy dual-write only
- `agentsam_cloudflare_oauth_state` — **removed**; use `oauth_state_nonces`

## Three auth concerns (do not flatten)

| Lane | Tables | Purpose |
|---|---|---|
| AgentSam AS | `oauth_clients`, `oauth_access_tokens`, … | Tokens AgentSam **issues** to clients |
| Provider connections | `user_oauth_tokens` | Tokens Cloudflare/Google/GitHub **issue** to the user |
| Identity login | `identity_oauth_states` | Sign-in to AgentSam |
| OAuth CSRF/PKCE | `oauth_state_nonces` | Multi-provider, encrypted `code_verifier` |

## Current readers/writers (SDK)

| Path | Behavior |
|---|---|
| `credential.js` | Prefers `user_oauth_tokens`, legacy dual-read only |
| `oauth-persist.js` | Canonical writer → `user_oauth_tokens` with scope union + `connected_via_client_id` |
| `routes.js` | Spine first; PKCE state in `oauth_state_nonces`; legacy connection dual-write best-effort |
| Host app | Passes `defaultCapabilities` into `handleCloudflareConnectionRequest` — connector has none |

## Provenance (`metadata_json`)

- `connected_via_client_id` — real Cloudflare OAuth client_id only
- `granted_at_capability_set` — optional capability ids that drove the request
- `cloudflare_account_id`

No invented `connected_via_app` enum.

## Callback lanes (both kept — different jobs)

| Path | Job |
|---|---|
| `/api/connections/cloudflare/callback` | Resource connect → `user_oauth_tokens` |
| `/api/oauth/cloudflare/callback` | Identity login (Sign in with Cloudflare) |
