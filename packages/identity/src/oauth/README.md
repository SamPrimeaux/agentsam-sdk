# OAuth credential lanes

| Lane | Env vars | When |
|------|----------|------|
| **IAM platform (default)** | `IAM_CLIENT_ID` + `IAM_CLIENT_SECRET` | Minted at install/build for every customer worker |
| Developer Google (web) | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Takes `/api/oauth/google/start` when set |
| Google Desktop / CLI | `GOOGLE_DESKTOP_CLIENT_ID` | Public Authorization Code + PKCE with loopback redirect; no desktop secret |
| Developer GitHub | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Takes `/api/oauth/github/start` when set |
| Cloudflare sign-in | `CLOUDFLARE_OAUTH_CLIENT_ID` (+ optional secret) | Takes `/api/oauth/cloudflare/start` when set |

Optional: `IAM_ORIGIN` (default `https://inneranimalmedia.com`).

## Secrets law

- `IAM_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GOOGLE_DESKTOP_CLIENT_ID` / `GITHUB_CLIENT_ID` / `CLOUDFLARE_OAUTH_CLIENT_ID` — plaintext Wrangler vars (public by OAuth design).
- `*_CLIENT_SECRET` — **Wrangler secrets only** — never plaintext in `wrangler.toml`. Desktop clients normally have **no** secret.

```bash
npx wrangler secret put IAM_CLIENT_SECRET
```

## Customer worker routes (relying party)

These routes live in the **customer** worker (`handleIdentityWorkerRequest`):

1. `/api/oauth/inneranimalmedia/start` → redirects to IAM AS (requires minted `IAM_CLIENT_*`)
   - Legacy alias: `/api/oauth/iam/start`
2. `/api/oauth/google/start` → BYOK Google if `GOOGLE_*` set, else platform lane if minted, else 503
3. `/api/oauth/google/desktop-exchange` → CLI/desktop PKCE broker (`GOOGLE_DESKTOP_CLIENT_ID`; loopback only)
4. `/api/oauth/github/start` → same for GitHub
5. `/api/oauth/cloudflare/start` → Cloudflare sign-in when `CLOUDFLARE_OAUTH_CLIENT_ID` set
6. Callback: `/api/oauth/inneranimalmedia/callback` (platform lane) or `/api/oauth/{google|github|cloudflare}/callback` (BYOK)
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
- `goaude.js` — desktop PKCE token broker
- `providers/iam/` — IAM AS client (`getIamAuthUrl`, `exchangeIamCode`, `fetchIamProfile`)
- `iam-platform.js` — customer-worker start/callback wiring (uses `providers/iam/`)
- `pkce.js` — shared PKCE helpers

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
