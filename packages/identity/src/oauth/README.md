# OAuth credential lanes

| Lane | Env vars | When |
|------|----------|------|
| **IAM platform (default)** | `IAM_CLIENT_ID` + `IAM_CLIENT_SECRET` | Minted at install/build for every customer worker |
| Developer Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Takes `/api/oauth/google/start` when set |
| Developer GitHub | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Takes `/api/oauth/github/start` when set |

Optional: `IAM_OAUTH_ISSUER` (default `https://inneranimalmedia.com`).

## Secrets law

- `IAM_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` — plaintext Wrangler vars (public by OAuth design).
- `*_CLIENT_SECRET` — **Wrangler secrets only** — never plaintext in `wrangler.toml`.

```bash
npx wrangler secret put IAM_CLIENT_SECRET
```

## Routing

1. `/api/oauth/iam/start` → always IAM (requires minted creds)
2. `/api/oauth/google/start` → BYOK Google if `GOOGLE_*` set, else IAM if minted, else 503
3. `/api/oauth/github/start` → same for GitHub
4. Callback: `/api/oauth/iam/callback` (IAM) or `/api/oauth/{google|github}/callback` (BYOK)

Register IAM redirect URI: `https://<customer-host>/api/oauth/iam/callback`

## Code

- `credentials.js` — lane resolution
- `iam-platform.js` — IAM authorize + token + userinfo
- `pkce.js` — shared PKCE helpers
