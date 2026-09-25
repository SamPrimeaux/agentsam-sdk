# AgentSam Credential System

## Answers (current Worker)

### How does `/api/vault/*` work?

```
Browser /settings/keys
        │
        ▼
POST /api/vault/secrets  { service_name, value }
        │
        ▼
AES-256-GCM encrypt with VAULT_MASTER_KEY
  AAD = userId:service:name
        │
        ▼
D1 user_secrets (ciphertext + metadata + last4)
        │
GET list → metadata only (never plaintext)
POST unwrap → service lane only (bridge / internal)
```

Auth lanes on the vault Worker:

| Lane | Header / cookie | Use |
|---|---|---|
| Browser session | identity session cookie | user manages own BYOK keys |
| Bridge | `AGENTSAM_BRIDGE_KEY` | machine unwrap / inventory |

## VAULT_MASTER_KEY format

Required:

```
v1.<base64 of exactly 32 bytes>
```

Generate / rotate:

```bash
node -e "import('node:crypto').then(({randomBytes})=>console.log('v1.'+randomBytes(32).toString('base64')))" \
  | npx wrangler secret put VAULT_MASTER_KEY -c apps/local-studio/backend/wrangler.jsonc
```

Or: `node apps/local-studio/scripts/ensure-vault-secret.mjs` (mints `v1.` when missing; does **not** rotate an existing secret).

Arbitrary strings are **rejected** (no silent truncate/hash).

### App-owned keys (no cross-app coupling)

Each Worker owns its own `VAULT_MASTER_KEY`. Rotating Local Studio (`agentsam-sdk` Worker via `apps/local-studio/backend/wrangler.jsonc`) has **zero** effect on Inner Animal Media’s Worker secret of the same name, and vice versa. Never copy a vault master key between apps.

### After rotation — BYOK re-save

Existing `user_secrets` ciphertext encrypted under the previous master key will not decrypt. There is no safe server-side re-encrypt without plaintext.

Operational plan:

1. Rotate `VAULT_MASTER_KEY` on the target Worker only (pipe into `wrangler secret put`; never log/print the value).
2. Deploy that Worker so runtime imports the new `v1.` key.
3. In Local Studio → **Settings → Keys**, delete orphaned provider rows (or they will fail on unwrap), then re-enter each BYOK value and save. New ciphertext is sealed under the new key.
4. Do **not** bulk-wipe shared D1 `user_secrets` unless you intend to invalidate every consumer of that table — scope cleanup to the users/services you manage in this app.

### Where is `AGENTSAM_API_KEY` minted / used?

| Concern | Detail |
|---|---|
| Format | `aak_*` |
| Store | IAM D1 `agentsam_api_credentials` (**hash only**) |
| Verify | `resolveAgentsamApiCredential` on inneranimalmedia |
| Consume | `Authorization: Bearer aak_…` in SDK/CLI for remote control-plane |
| Env | Customer sets `AGENTSAM_API_KEY` in wrangler/env — **compatibility adapter**, not primary UX |
| Not | Browser OAuth session, bridge key, or vault ciphertext |

Mint path: account credential rows are verified today; product mint UI belongs on `/settings/keys` under kind `agentsam_api_key` (registry already defines the provider). Hash insert against `agentsam_api_credentials` is the IAM-side write still to productize.

## New packages (this change)

```
packages/agentsam-vault/        contracts, AES-GCM, provider registry, resolver
packages/agentsam-key-manager/  SensitiveInput, KeysPage, IntegrationsPage
```

Local Studio `/settings/keys` and `/settings/integrations` now consume key-manager; vault API remains the hosted backend.

## Authority split (from your CF dashboard)

| Secret / var | Role |
|---|---|
| `VAULT_MASTER_KEY` | Encrypt user_secrets |
| `AGENTSAM_BRIDGE_KEY` | Machine service auth |
| `IAM_CLIENT_ID` / `IAM_CLIENT_SECRET` | Hosted OAuth confidential client |
| `CLOUDFLARE_OAUTH_CLIENT_ID` (+ optional secret) | CF OAuth (PKCE-only OK without secret) |
| `OPENAI_API_KEY` etc. | Env fallback until vault wins |
| `AGENTSAM_API_KEY` | Delegated `aak_*` for customers' Workers |
