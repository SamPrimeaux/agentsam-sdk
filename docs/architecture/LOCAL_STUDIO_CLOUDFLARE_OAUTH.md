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

## D1

- `identity_oauth_states` — identity PKCE (migration `0013_identity_oauth_states.sql`)
- `agentsam_cloudflare_oauth_state` — MCP connector PKCE

## IAM AS redirect (required)

Register on client `iam_agentsam_sdk_web`:

`https://agentsam.inneranimalmedia.com/api/oauth/inneranimalmedia/callback`

(Keep legacy `/api/oauth/iam/callback` during migration.)
