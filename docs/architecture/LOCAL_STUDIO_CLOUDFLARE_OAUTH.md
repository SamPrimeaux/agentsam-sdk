# Cloudflare OAuth — AgentSam Local Studio

**Client:** AgentSam Local Studio (Cloudflare dashboard → OAuth clients)  
**Account:** `ede6590ac0d2fb7daf155b35653457b2`  
**Auth method:** Authorization Code + Refresh Token · **PKCE** (Token Authentication Method = None)  
**Worker secret:** `CLOUDFLARE_OAUTH_CLIENT_ID` (already set on `agentsam-sdk` Worker)

## Two flows, one client

| Flow | Start URL | Callback (must be registered) |
|------|-----------|-------------------------------|
| **Identity login** (“Sign in with Cloudflare”) | `/api/oauth/cloudflare/start?next=/agentsam` | `https://agentsam.inneranimalmedia.com/api/oauth/cloudflare/callback` |
| **Account connector** (Workers/D1/MCP) | `/api/connections/cloudflare/start` | `https://agentsam.inneranimalmedia.com/api/connections/cloudflare/callback` |

Local / preview:

- `http://localhost:3000/api/oauth/cloudflare/callback`
- `http://localhost:3000/api/connections/cloudflare/callback`

## Required action in Cloudflare dashboard

Edit **AgentSam Local Studio** → Redirect (Callback) URLs — ensure **all** of the above are listed.

As of the last audit, only the **connections** callbacks were present. Add the **identity** callback or “Sign in with Cloudflare” fails after approve.

Desktop deep link `agentsamstudio://callback` is handled by the Tauri shell after the **HTTPS** callback sets the session cookie — do not register a custom scheme on the CF OAuth client unless Cloudflare documents support for it.

## Wrangler

`apps/local-studio/backend/wrangler.jsonc` does **not** put the client id in `vars` (it is already a Worker **secret**). Do not duplicate as a var — Wrangler rejects the same name in both places.

Identity + connector routes are mounted in `apps/local-studio/backend/worker/index.js` (`/api/oauth/*` and `/api/connections/cloudflare*`).

## User messaging (CLI)

When no Ollama / no API keys, `agentsam codebaseindex` offers:

1. Continue AST-only  
2. `agentsam providers`  
3. Install Ollama  
4. Open Local Studio login / CF OAuth approve links  

SSOT helper: `src/lib/ai-access-onboarding.js`
