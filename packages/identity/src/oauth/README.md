# OAuth credentials (customer apps)

Every app installing `@inneranimalmedia/agentsam-sdk` identity **must** provision:

| Env var | Role |
|---------|------|
| `IAM_CLIENT_ID` | OAuth client id minted for the customer worker |
| `IAM_CLIENT_SECRET` | OAuth client secret (encrypted at rest via Wrangler secrets) |

Optional: `IAM_OAUTH_ISSUER` (default `https://inneranimalmedia.com`).

## Secrets law

`**_CLIENT_SECRET` values are Wrangler secrets only** — never plaintext in `wrangler.toml` / committed `.env`.

```bash
npx wrangler secret put IAM_CLIENT_ID
npx wrangler secret put IAM_CLIENT_SECRET
```

## IAM platform flow

1. `GET /api/oauth/google/start` or `/api/oauth/github/start` → `{IAM_OAUTH_ISSUER}/api/oauth/authorize` (PKCE)
2. User signs in at IAM (Google/GitHub/email on IAM)
3. `GET /api/oauth/iam/callback` on customer worker → token exchange + userinfo → local session

Register redirect URI with IAM: `https://<customer-host>/api/oauth/iam/callback`

## Code

- `credentials.js` — `resolveIamPlatformCredentials` / `requireIamPlatformCredentials`
- `iam-platform.js` — IAM authorize + token + userinfo
- `pkce.js` — shared PKCE helpers
