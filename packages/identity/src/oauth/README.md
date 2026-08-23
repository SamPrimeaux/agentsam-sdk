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

## Customer worker routes (relying party)

These routes live in the **customer** worker (`handleIdentityWorkerRequest`):

1. `/api/oauth/iam/start` → redirects to IAM AS (requires minted `IAM_CLIENT_*`)
2. `/api/oauth/google/start` → BYOK Google if `GOOGLE_*` set, else IAM if minted, else 503
3. `/api/oauth/github/start` → same for GitHub
4. Callback: `/api/oauth/iam/callback` (IAM lane) or `/api/oauth/{google|github}/callback` (BYOK)

Register IAM redirect URI: `https://<customer-host>/api/oauth/iam/callback`

## IAM authorization server endpoints (issuer)

The customer worker redirects users to the **issuer** (`IAM_OAUTH_ISSUER`, default production IAM):

| Step | Endpoint |
|------|----------|
| Authorize | `GET {issuer}/api/oauth/identity/authorize` |
| Token | `POST {issuer}/api/oauth/identity/token` |
| Userinfo | `GET {issuer}/api/oauth/identity/userinfo` |

OIDC scopes: `openid profile email` (not a bespoke `identity:*` namespace).

## Code

- `credentials.js` — lane resolution
- `providers/iam/` — IAM AS client (`getIamAuthUrl`, `exchangeIamCode`, `fetchIamProfile`)
- `iam-platform.js` — customer-worker start/callback wiring (uses `providers/iam/`)
- `pkce.js` — shared PKCE helpers
