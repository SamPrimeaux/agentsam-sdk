# Cloudflare connector — OAuth storage (SSOT)

## Single store

**`user_oauth_tokens`** (`provider = 'cloudflare'`) is the only connection credential table.

Legacy `agentsam_cloudflare_connections` is no longer written or read on the hot path.
A one-shot migrate in `routes.ensureTables` copies any remaining `status='connected'`
legacy rows into `user_oauth_tokens` (when vault can decrypt), then marks them superseded.

## Field mapping (former legacy columns)

| Legacy (`agentsam_cloudflare_connections`) | SSOT (`user_oauth_tokens`) |
|---|---|
| `cloudflare_account_id` | `account_identifier` + `metadata_json.cloudflare_account_id` |
| `scopes` | `scopes` / `scope` |
| `status` (`connected` / `superseded` / `revoked`) | `is_active` + `revoked_at` + `metadata_json.status` |
| `access_token_encrypted` | `access_token_encrypted` (connector AAD) or IAM-encrypted via host decrypt |
| `connection_id` | row `id` (or account_identifier for seed keys) |

No provider-specific columns added to `user_oauth_tokens` — it stays multi-provider.

## Three auth concerns (do not flatten)

| Lane | Tables | Purpose |
|---|---|---|
| AgentSam AS | `oauth_clients`, `oauth_access_tokens`, … | Tokens AgentSam **issues** to clients |
| Provider connections | `user_oauth_tokens` | Tokens Cloudflare/Google/GitHub **issue** to the user |
| Identity login | `identity_oauth_states` | Sign-in to AgentSam |
| OAuth CSRF/PKCE | `oauth_state_nonces` | Multi-provider, encrypted `code_verifier` |

## Readers / writers (SDK)

| Path | Behavior |
|---|---|
| `credential.js` | Reads `user_oauth_tokens` only |
| `oauth-persist.js` | Canonical writer — scope union, supersede siblings, vault seal when available |
| `routes.js` | Callback / disconnect / status → spine only; optional legacy migrate |
| Host app | Passes `defaultCapabilities` into `handleCloudflareConnectionRequest` |

## Provenance (`metadata_json`)

- `connected_via_client_id` — real Cloudflare OAuth client_id only
- `granted_at_capability_set` — optional capability ids that drove the request
- `cloudflare_account_id`
- `status` — `connected` | `superseded` | `revoked`

## Callback lanes (both kept — different jobs)

| Path | Job |
|---|---|
| `/api/connections/cloudflare/callback` | Resource connect → `user_oauth_tokens` |
| `/api/oauth/cloudflare/callback` | Identity login (Sign in with Cloudflare) |
