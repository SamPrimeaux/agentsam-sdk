# Secrets vault plan — AgentSam Workmode

**Goal:** When a user connects Cloudflare and/or GitHub, or pastes a BYOK API key, the secret is **encrypted at rest**, **usable only by server routes** owned by that user, and **audited**. The app becomes a safe control plane, not a token notepad.

**Database:** Cloudflare D1 `inneranimalmedia-business`  
**Status:** Vault Worker **live** at `agentsam-workmode` (workers.dev + path routes on `simple.inneranimalmedia.com/health` and `/api/vault*`). UI Worker is `agentsam-grok-workmode` on the same host. Account `ede6590ac0d2fb7daf155b35653457b2`. Workmode UI still uses interim `localStorage` until Connect is wired to vault.

---

## 1. Threat model (what we are fixing)

| Risk | Interim today | Target |
| --- | --- | --- |
| XSS / shared device reads tokens | Plaintext `localStorage` | No secrets in the browser after save |
| Tokens in chat / logs | Easy to paste into composer | Server accepts once; never echoes raw value |
| Cross-user leak | N/A (single browser) | Row scoped by `user_id` + `tenant_id` + `workspace_id` |
| Lost laptop | Tokens roam with profile sync | Ciphertext useless without Worker `VAULT_MASTER_KEY` |
| Over-privileged CI | User tokens in Actions | Only platform deploy token in Actions; user secrets stay in D1 vault |

Out of scope for v1: client-side zero-knowledge (user holds the only key). v1 is **server-side vault** with Worker-held master key — same model as the IAM platform.

---

## 2. Source of truth (reuse platform tables)

Do **not** create `workmode_secrets` or a second crypto format.

### `user_secrets` — BYOK / pasted keys

Key columns already present:

- `secret_value_encrypted` — ciphertext (required)
- `secret_type` — `api_key` | `token` | …
- `service_name` — `github` | `cloudflare` | `xai` | `openai` | …
- `user_id`, `tenant_id`, `workspace_id`, `account_id`
- `vault_secret_id` — optional indirection / rotation handle
- `last_used_at`, `usage_count`, `is_active`, `expires_at`
- Unique `(user_id, secret_name, service_name)`

### `user_oauth_tokens` — Connect flows

- Prefer `access_token_encrypted` / `refresh_token_encrypted` (and/or `vault_*_token_id`)
- Keep plaintext `access_token` / `refresh_token` columns **null** for new rows
- Track `refresh_failure_count`, `revoked_at`, `is_active`

### `env_secrets` — Worker / platform registry

- `key_type`: `workers_secret` | `encrypted_d1` | `public_config`
- `encrypted_value` + `iv` when `encrypted_d1`
- Use for app-level config, not end-user BYOK

### `secret_audit_log`

- Events: `created` | `rotated` | `decrypted_for_use` | `revoked` | `failed_decrypt`
- Store **last4** only, never full secret

### `agentsam_user_ui_preferences`

- Theme / accent / density — **not** secrets

---

## 3. Crypto contract

```text
VAULT_MASTER_KEY  →  Worker secret (32-byte key material, base64 in wrangler secret)
Algorithm         →  AES-256-GCM (Web Crypto in Workers)
Plaintext         →  UTF-8 secret string
AAD (recommended) →  `${userId}:${serviceName}:${secretName}`
Stored            →  base64(iv || ciphertext || authTag)
                     or ciphertext + separate iv column (env_secrets style)
```

### Worker helpers (target module)

`src/lib/vault/crypto.ts` (server-only):

- `encryptSecret(plaintext, aad) → { ciphertextB64, keyVersion }`
- `decryptSecret(ciphertextB64, aad) → plaintext`
- Refuse to run in client bundles (no `VAULT_MASTER_KEY` import from UI)

### Key rotation

1. Introduce `VAULT_MASTER_KEY_V2` alongside v1
2. Re-encrypt rows lazily on next use, or batch job
3. Record `key_version` in `metadata_json` or a dedicated column when added
4. Retire v1 only after zero rows reference it

---

## 4. API surface (Workmode)

All routes require authenticated session (`user_id` from server, never from client body).

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/vault/secrets` | Encrypt + upsert `user_secrets`; return `{ id, last4, service }` |
| `GET` | `/api/vault/secrets` | List metadata only (no ciphertext, no plaintext) |
| `DELETE` | `/api/vault/secrets/:id` | Soft-revoke (`is_active=0`) + audit |
| `POST` | `/api/oauth/cloudflare/start` | Begin CF OAuth (scopes ⊆ platform client catalog) |
| `GET` | `/api/oauth/cloudflare/callback` | Exchange code → encrypt tokens → `user_oauth_tokens` |
| `POST` | `/api/oauth/github/start` | GitHub App / OAuth start |
| `GET` | `/api/oauth/github/callback` | Same vault write path |
| `POST` | `/api/github` / `/api/cloudflare` | Resolve vault id → decrypt once → call provider |

### Safety rules for ship routes

- Accept `secretId` or “use connected account”, **not** raw token from the client once vault is live
- Temporary migration: if vault miss and legacy local token posted, encrypt-on-write then proceed
- Never return decrypted values in JSON responses
- Rate-limit decrypt-for-use; bump `usage_count` / `last_used_at`

---

## 5. Connect UX

1. **Settings → Connections**
   - Cloudflare: Connect / Reconnect / Disconnect
   - GitHub: Connect / Reconnect / Disconnect
   - Status chips: `connected` | `needs_reauth` | `missing`
2. **Settings → API keys (BYOK)**
   - Name + service + value (password field)
   - After save: show `sk-…abcd` style mask only
3. **Ship panel**
   - Uses connected accounts by default
   - Falls back to “add connection” CTA, not a permanent plaintext token box

Mobile: same flows in a full-screen sheet; no horizontal token tables.

---

## 6. Implementation sequence

1. **Wrangler bind** — `wrangler.toml` → D1 `inneranimalmedia-business`; put `VAULT_MASTER_KEY`
2. **Crypto module** — AES-GCM encrypt/decrypt + unit tests (round-trip, wrong AAD fails)
3. **Vault API** — list/create/revoke against `user_secrets`
4. **Migrate Settings** — stop writing `agentsam-ship-secrets` localStorage; call vault API when signed in
5. **Cloudflare OAuth** — reuse monorepo scope catalog; write `user_oauth_tokens`
6. **GitHub OAuth / App** — same
7. **Rewire ship routes** — decrypt-at-use; drop client token body
8. **Audit + last_used** — every decrypt logs `secret_audit_log`
9. **Prefs** — theme JSON in `agentsam_user_ui_preferences`
10. **SDK lane** — optional `agentsam init` template that ships with vault stubs wired

Gate for “done”: connect CF + GitHub on a phone session, deploy a Pages project, refresh the phone — still connected, no plaintext tokens in Application → Local Storage.

---

## 7. Explicit non-goals (v1)

- Browser-only encryption with a user password (nice later; slows Connect)
- Storing secrets in R2 / KV as primary (D1 rows are enough; R2 only if blob certs appear)
- Sharing one user secret across tenants
- Putting BYOK keys in GitHub Actions secrets for end users

---

## 8. Related platform docs

- `docs/DEPLOY_AND_AGENT_GUIDE.md` — D1 execute discipline for `inneranimalmedia-business`
- `docs/auth/CLOUDFLARE_OAUTH_CLIENT_SCOPES.md` — allowed CF OAuth scopes
- Architecture decision: one OAuth + vault lane (`oauth_*` + encrypted columns), not parallel auth systems
