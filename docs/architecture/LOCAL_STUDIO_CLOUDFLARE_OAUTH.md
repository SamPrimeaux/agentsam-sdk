# Cloudflare OAuth — AgentSam Local Studio

**Client:** AgentSam Local Studio · PKCE · secret `CLOUDFLARE_OAUTH_CLIENT_ID` on Worker

## Flows

| Flow | Start | Callback |
|------|-------|----------|
| Identity (“Sign in with Cloudflare”) | `/api/oauth/cloudflare/start?next=/agentsam` | `/api/oauth/cloudflare/callback` |
| MCP / account connector (`@agentsam-mcp`) | `/api/connections/cloudflare/start` | `/api/connections/cloudflare/callback` |
| Platform identity (`inneranimalmedia`) | `/api/oauth/inneranimalmedia/start` | `/api/oauth/inneranimalmedia/callback` |
| Legacy alias | `/api/oauth/iam/start` | `/api/oauth/iam/callback` |

Browser GET on connections **start** → 302 to Cloudflare.  
`fetch` + `Accept: application/json` → `{ authorize_url }`.

## D1 tables (Cloudflare connect / approve)

| Table | Role |
|---|---|
| `oauth_state_nonces` | Short-lived PKCE state for connector `/api/connections/cloudflare/*` |
| `identity_oauth_states` | Short-lived PKCE for identity “Sign in with Cloudflare” |
| `user_oauth_tokens` | **SSOT** durable grant: sealed access/refresh, scopes, `account_identifier` (= CF account id), `is_active` |
| `agentsam_cloudflare_connections` | **Legacy** — migrated/superseded into `user_oauth_tokens`; do not write new rows |
| `agentsam_cloudflare_oauth_state` | Legacy MCP connector PKCE (prefer `oauth_state_nonces`) |

Vault seals token material; D1 never stores raw refresh/access plaintext in the durable grant row when vault is configured.

Resource discovery (their D1/R2/Workers) uses the sealed token from `user_oauth_tokens` — never the platform `env.DB` binding.


Register on client `iam_agentsam_sdk_web`:

`https://agentsam.inneranimalmedia.com/api/oauth/inneranimalmedia/callback`

(Keep legacy `/api/oauth/iam/callback` during migration.)
