# OAuth credential lanes

| Lane | Env vars | When |
|------|----------|------|
| **IAM platform (default)** | `IAM_CLIENT_ID` + `IAM_CLIENT_SECRET` | Minted at install/build for every customer worker |
| Developer Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Takes `/api/oauth/google/start` when set |
| Developer GitHub | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Takes `/api/oauth/github/start` when set |

Optional: `IAM_ORIGIN` (default `https://inneranimalmedia.com`).

## Secrets law

- `IAM_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` — plaintext Wrangler vars (public by OAuth design).
- `*_CLIENT_SECRET` — **Wrangler secrets only** — never plaintext in `wrangler.toml`.

```bash
npx wrangler secret put IAM_CLIENT_SECRET
```

## Customer worker routes (relying party)

These routes live in the **customer** worker (`handleIdentityWorkerRequest`):

1. `/api/oauth/inneranimalmedia/start` → redirects to IAM AS (requires minted `IAM_CLIENT_*`)
   - Legacy alias: `/api/oauth/iam/start`
2. `/api/oauth/google/start` → BYOK Google if `GOOGLE_*` set, else platform lane if minted, else 503
3. `/api/oauth/github/start` → same for GitHub
4. Callback: `/api/oauth/inneranimalmedia/callback` (platform lane) or `/api/oauth/{google|github|cloudflare}/callback` (BYOK)
   - Legacy alias: `/api/oauth/iam/callback`

Register platform redirect URI on the IAM client:

`https://<customer-host>/api/oauth/inneranimalmedia/callback`

(Keep the legacy `/api/oauth/iam/callback` registered during migration.)

## IAM authorization server endpoints (issuer)

The customer worker redirects users to the **issuer** (`IAM_ORIGIN`, default production IAM):

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
