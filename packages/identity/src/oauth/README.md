# OAuth credential lanes

Customer apps resolve credentials in this order:

| Lane | Env vars | When |
|------|----------|------|
| **IAM platform (default)** | `IAM_CLIENT_ID` + `IAM_CLIENT_SECRET` | Inner Animal Media hosted OAuth — register via DCR or platform provisioning |
| **BYOK Google** | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Customer brings own Google OAuth app (only when IAM creds absent) |
| **BYOK GitHub** | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Customer brings own GitHub OAuth app (only when IAM creds absent) |

Optional: `IAM_OAUTH_ISSUER` (default `https://inneranimalmedia.com`).

## Secrets law

`**_CLIENT_SECRET` values are Wrangler secrets only** — never plaintext in `wrangler.toml` / committed `.env`.

```bash
npx wrangler secret put IAM_CLIENT_ID
npx wrangler secret put IAM_CLIENT_SECRET
```

## IAM platform flow

1. `GET /api/oauth/google/start` or `/api/oauth/github/start` → redirects to `{IAM_OAUTH_ISSUER}/api/oauth/authorize` (PKCE)
2. User signs in at IAM (Google/GitHub/email on IAM)
3. `GET /api/oauth/iam/callback` on customer worker → token exchange + userinfo → local session

Register redirect URI with IAM: `https://<customer-host>/api/oauth/iam/callback`

## BYOK flow

Direct provider OAuth when IAM creds are not set — same paths as before (`/api/oauth/google/callback`, etc.).

## Code

- `credentials.js` — lane resolution
- `iam-platform.js` — IAM authorize + token + userinfo
- `pkce.js` — shared PKCE helpers
