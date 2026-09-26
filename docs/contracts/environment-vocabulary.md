# Environment vocabulary

**Authority:** `agentsam-sdk`  
**Companion:** [`docs/AUTH_IDENTITY_CONTRACT.md`](../AUTH_IDENTITY_CONTRACT.md) · `packages/identity/src/contracts/auth-config.js`  
**Rule:** names and classification only. Never log or document secret values. Do not remove aliases until call-site audit clears them.

This document is the law for env naming across AgentSam CLI, Local Studio, Identity, and Vault. It exists so sessions stop inventing tribal aliases.

---

## Three lanes (do not flatten)

| Lane | Variables | Who it authenticates | Used by |
| --- | --- | --- | --- |
| **Account / platform** | `AGENTSAM_API_KEY` | The human (or delegated account) using AgentSam | CLI, SDK, Local Studio user work |
| **Machine / bridge** | `AGENTSAM_BRIDGE_KEY` | A worker, VM, ExecOS front-door, or CI host talking to AgentSam infrastructure | Workers, iam-tunnel agents, CAD/build services |
| **OAuth app (Identity)** | `IAM_CLIENT_ID`, `IAM_CLIENT_SECRET`, `IAM_OAUTH_ISSUER` (+ compat `IAM_ORIGIN`) | The *application* as an OAuth client of InnerAnimalMedia Identity | Customer Worker / Local Studio login portal |

Provider API keys (`OPENAI_*`, `CLOUDFLARE_API_TOKEN`, …) are a **fourth** lane: external vendor credentials managed by vault/Connections — never aliases of the three lanes above.

### Customer mental model

```text
User 123 signs in (browser OAuth via IAM_CLIENT_* against IAM_OAUTH_ISSUER)
     ↓
User 123 gets an AGENTSAM_API_KEY for their account (CLI / API / Local Studio)
     ↓
User 123's machine or Worker holds AGENTSAM_BRIDGE_KEY for machine↔platform calls
     ↓
User 123 connects Cloudflare / GitHub / GCP / models as Provider Connections
```

`AGENTSAM_API_KEY` = “what can *this account* do on AgentSam.”  
`AGENTSAM_BRIDGE_KEY` = “what can *this machine/worker* invoke without pretending to be the user.”  
`IAM_CLIENT_*` = “stock OAuth client so the product can encrypt/protect login using our Identity provisioning.”

---

## AgentSam keys vs Google Cloud service-account keys

These are **parallel authority systems**. Do not rename Google `KEY_ORIGIN` fields in place.

| Concept | Issuer | Lives in | Authenticates | Google `KEY_ORIGIN` analogy (AgentSam overlay only) |
| --- | --- | --- | --- | --- |
| `AGENTSAM_API_KEY` (`aak_*`) | Inner Animal Media / AgentSam | vault / keychain | Human/account on AgentSam platform | `USER_MANAGED` + `INNERANIMALMEDIA_PROVIDED` |
| `AGENTSAM_BRIDGE_KEY` | Inner Animal Media (machine mint) | Worker secret / vault | Machine↔ExecOS/Worker to AgentSam APIs | `SYSTEM_MANAGED` + `INNERANIMALMEDIA_PROVIDED` |
| Google user ADC / `gcloud auth` | Google user OAuth | gcloud / ADC | Human operating GCP | n/a (user session, not SA key) |
| GCP SA `SYSTEM_MANAGED` key | Google | Google IAM | Google runtime for that SA | stays `GOOGLE_PROVIDED` |
| GCP SA `USER_MANAGED` JSON key | Google (operator-downloaded) | whoever stored the JSON | That SA via private key file | stays `GOOGLE_PROVIDED` — prefer delete/rotate |

**Product UI may show a unified inventory table** with an AgentSam overlay column (`agentsam_origin_label`).  
**Google’s API metadata must remain truthful** (`GOOGLE_PROVIDED`). We never claim Google minted an InnerAnimalMedia key.

How Local Studio Connections compose:

```text
Local Studio
  ├── Identity login          → IAM_CLIENT_* + browser session
  ├── Account API             → AGENTSAM_API_KEY
  ├── This Mac / ExecOS       → AGENTSAM_BRIDGE_KEY (+ local device provider)
  └── Google Cloud connection → user's Google OAuth + discovered projects/VMs/SAs/billing
```

`agentsam google-cloud iam service-accounts list` discovers **customer GCP** workload identities.  
It does **not** mint `AGENTSAM_*` keys into Google IAM.

---

## Classification legend

| Class | Meaning |
| --- | --- |
| `canonical` | Prefer in new code |
| `compatibility_alias` | Keep until zero call sites |
| `provider_native` | Owned by external CLI/SDK |
| `application_config` | Non-secret wiring |
| `user_credential` | Human/account delegated secret |
| `machine_credential` | Host/integration secret |
| `server_secret` | Worker/server only — never browser |
| `browser_safe` | Public by OAuth design |
| `deprecated` | Stop using |
| `unknown` | Needs owner decision |

---

## Normalization table

| current name | canonical name | owner | secret? | class | migration |
| --- | --- | --- | --- | --- | --- |
| `AGENTSAM_API_KEY` | same | AgentSam account | yes | user_credential / canonical | vault + keychain via `agentsam env` |
| `IAM_API_KEY` | `AGENTSAM_API_KEY` | legacy | yes | compatibility_alias | rewrite call sites |
| `AGENTSAM_SDK_TOKEN` / `AGENTSAM_SDK_KEY` | `AGENTSAM_API_KEY` | retired docs | yes | deprecated | docs scrub only |
| `AGENTSAM_BRIDGE_KEY` | same | ExecOS / Worker bridge | yes | machine_credential / canonical | never alias to API key |
| `EXECOS_KEY` | `AGENTSAM_BRIDGE_KEY` | IAM worker envs | yes | compatibility_alias | dual-read then single |
| `IAM_OAUTH_ISSUER` | same | Identity protocol | no | application_config / canonical | preferred issuer |
| `IAM_ORIGIN` | `IAM_OAUTH_ISSUER` | Identity | no | compatibility_alias | fallback only |
| `IAM_CLIENT_ID` | same | Identity OAuth client | no* | browser_safe | minted at install/build |
| `IAM_CLIENT_SECRET` | same | Identity OAuth client | yes | server_secret | wrangler secret / vault |
| `CLOUDFLARE_API_TOKEN` | same | Cloudflare | yes | user/machine credential | product: OAuth Connection first |
| `CLOUDFLARE_ACCOUNT_ID` | same | Cloudflare | no | application_config | discover via whoami when possible |
| `CLOUDFLARE_OAUTH_CLIENT_ID` | same | Identity CF login | no* | browser_safe | Connections + login |
| `CLOUDFLARE_OAUTH_CLIENT_SECRET` | same | Identity CF login | yes | server_secret | optional for PKCE-only |
| `GITHUB_TOKEN` / `GH_TOKEN` | prefer `gh` keyring / GitHub App | GitHub | yes | provider_native | unset stale shell tokens |
| `GITHUB_CLIENT_ID` / `SECRET` | same | Identity login | mixed | OAuth app | BYOK login lane |
| `GOOGLE_CLIENT_ID` / `SECRET` | same | Identity login | mixed | OAuth app | BYOK login lane |
| `GEMINI_API_KEY` | same | Google AI | yes | user_credential | vault |
| `GOOGLE_API_KEY` / `GOOGLE_AI_API_KEY` / `GOOGLE_KEY` | `GEMINI_API_KEY` | drift | yes | compatibility_alias | dual-read in resolver |
| `OPENAI_API_KEY` | same | OpenAI | yes | user_credential | vault |
| `ANTHROPIC_API_KEY` | same | Anthropic | yes | user_credential | vault |
| `CURSOR_API_KEY` | same | Cursor | yes | user_credential | vault |
| `XAI_API_KEY` | same | xAI | yes | user_credential | optional |
| `GCP_PROJECT_ID` / `GCP_ZONE` / `GCP_VM_NAME` | same | ops / Connections | no | application_config | prefer discovery over hardcode |

\*OAuth client IDs are public-by-design; still do not log them next to secrets.

---

## Storage expectations

| Credential | Expected storage |
| --- | --- |
| `AGENTSAM_API_KEY` | macOS Keychain / vault via `agentsam api-key create --store keychain --activate` |
| Provider API keys | Encrypted vault + OS keychain (`agentsam providers` / `agentsam env`) |
| OAuth client secrets | Wrangler secrets / vault — never frontend bundles |
| `gcloud` user session | gcloud ADC (outside AgentSam until GCP Connection ships) |
| `gh` | macOS keyring (`gh auth`) |
| Compat plaintext | `~/.agentsam/env.d/*.env` only via `agentsam env export` — opt-in fallback |

### macOS Keychain prompt

AgentSam uses the **macOS Keychain** (Keychain Access / Security framework), not a separate “keychainos.” When a credential is stored with `--store keychain`, later reads may prompt for your Mac login password or Touch ID depending on the item’s ACL.

Useful flows:

```bash
agentsam api-key create --name "$(hostname)" --store keychain --activate
agentsam providers   # interactive vault/keychain setup
eval "$(agentsam env shell --profile default)"
```

If nothing prompts, the item may already be unlocked for this login session, or the value is still coming from process environment (ambient `export`). Prefer keychain/vault over shell exports for the customer path.

---

## Failure → next-step protocol (product law)

When auth/capability fails, AgentSam must not stop at “denied.” Mirror gcloud’s deterministic help:

1. **What failed** (provider, operation, reason code)
2. **What is configured** (names only — never values)
3. **Exact next command** (`agentsam login`, `agentsam providers`, `gcloud auth login`, …)
4. **Optional browser path** — “Press Enter to open …” for OAuth/consent/scopes
5. **Cheatsheet link** — `agentsam cheat-sheet` / docs URL

Target CLI surface (proposal):

```text
agentsam                  top-level groups (gcloud-like)
agentsam cheat-sheet      common flows
agentsam credentials audit [--json --names-only --verify --drift]
agentsam connections      provider connections (CF / GH / GCP / local)
agentsam compute          GCP/VM helpers (wrap gcloud safely)
agentsam billing          cost/billing discovery (not --billing-project)
```

`--billing-project` on gcloud is **API quota/billing attribution for that CLI call**, not a cost dashboard. Cost monitoring is `gcloud billing` / Cloud Console Billing — AgentSam should wrap *that*, not overclaim `--billing-project`.

---

## Related audits

Local machine audits (not committed; may contain fingerprint metadata):

- `~/.agentsam/audits/AUTH-ENV-AUDIT-2026-09-25.md`
