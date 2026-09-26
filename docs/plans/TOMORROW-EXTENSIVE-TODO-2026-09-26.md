# Tomorrow — comprehensive work list (2026-09-26 evening snapshot)

**Repo:** `/Users/samprimeaux/agentsam-sdk` · `main`  
**Also read:** [`TOMORROW-MACHINE-FIRST-BRIEFING.md`](./TOMORROW-MACHINE-FIRST-BRIEFING.md) · [`MACHINE_INTELLIGENCE.md`](../MACHINE_INTELLIGENCE.md)  
**Settings merge:** Settings v2 (`packages/agentsam-settings` + Local Studio host) is **on `main`** as of this evening. Fixture-backed localhost UI — **no D1/vault migration yet**.

**Preserve:** do not reset/stash/regenerate unrelated WIP. Inspect `git status` before editing. Other open branch (not merged tonight): `feat/project-control-workbench-20260925` @ `agentsam-sdk-project-control` worktree.

---

## A. Visual signoff — Settings v2 (do first if UI not yet approved)

- [ ] Cold-load Local Studio Settings on localhost: `/settings/general` and all 13 units  
- [ ] Nested views: `agents?view=models`, `customize?view=mcps`, `keys?view={credentials,secrets,sessions,audit}`  
- [ ] Fixture modes: `?fixture=first-run|degraded|security-findings`  
- [ ] Confirm package boundary feels right: `packages/agentsam-settings` owns UI/contracts; Local Studio only composes host  
- [ ] **Do not** apply D1 migrations or rewrite vault from this pass until signoff  

**Package layout already on main:**

```text
packages/agentsam-settings/   contracts · fixtures · frontend
apps/local-studio/.../settings/   LocalStudioSettingsPage · manifest · routes
```

---

## B. Settings backend (after UI signoff) — order matters

### B0. Design freeze

Three credential lanes stay physically distinct:

| Lane | Durable store | Plaintext |
|------|---------------|-----------|
| Account `aak_*` / `AGENTSAM_API_KEY` | `agentsam_api_credentials` (hash) | once at create/rotate via hosted `/api/sdk/api-keys` |
| Service / bridge `AGENTSAM_BRIDGE_KEY` | **new** `agentsam_service_credentials` (per-caller hash) | once; retire global “assert any X-User-Id” |
| Provider BYOK | `user_secrets` encrypted | never to browser; test/status only |

`VAULT_MASTER_KEY` stays Worker secret. AES-GCM AAD must bind **`account_id : secret_id : v1`** (not mutable name).

### B1. Host + routes

```text
apps/local-studio/backend/settings/
  http/router.*
  services/{account-credentials,service-credentials,vault-secrets,sessions,audit,usage}.*
  adapters/{iam-control-plane,d1-vault,credential-usage,vault-crypto}.*
```

Browser API (no unwrap endpoint):

- `GET/POST/DELETE …/api/settings/credentials/account[/:id/rotate]`  
- `…/credentials/service[/:id/rotate]`  
- `GET/POST/PATCH/DELETE …/api/settings/secrets` + `POST …/:id/test`  
- `GET/DELETE …/sessions` · `GET …/audit` · `GET …/usage`  

Account mint **adapts** to existing `/api/sdk/api-keys` — do not duplicate mint algorithm.

### B2. Replace fixture → read-only real adapters

- [ ] Wire `/api/auth/me` account id into host  
- [ ] Read-only credentials/secrets/sessions from real stores  
- [ ] Keep UI green while adapters land  

### B3. Normalize vault ownership

- [ ] Kill Worker vault paths that invent `user_id` / `tenant_id` / `workspace_id` as identity  
- [ ] All rows keyed by `account_id` → `accounts.id` (= `auth_users.id` normalized)  
- [ ] Migration **last**, after code paths exist  

### B4. Service credentials + usage ledger

- [ ] Table `agentsam_service_credentials` (per `account_id` + `caller_kind`/`caller_id`)  
- [ ] Append-only `credential_usage_events` for Last used / Monthly spend  
- [ ] Materialize `last_used_at` / `usage_count` on credential rows  

### B5. Production identity cleanup (Settings + Studio)

- [ ] Audit `apps/local-studio/frontend/src/lib/auth/*` → KEEP / REPLACE / PREVIEW / DELETE  
- [ ] Production session from `/api/auth/me` (packages/identity) — **not** Better Auth / Grok / PGLite donor authority  
- [ ] No second “Local Studio user”  

---

## C. Desktop installer + IAM identity (Connor / newuser123)

**Production already healthy:** `/`, `/auth/login`, `/agentsam` (cbad565 era). Desktop shell: `packages/agentsam-desktop-shell`, manifest `local-studio`.

### C1. Rebuild real installed app

- [ ] Confirm `packages/agentsam-desktop-shell/manifests/local-studio.json`  
  - `base_url`: `https://agentsam.inneranimalmedia.com`  
  - `launch_path`: `/agentsam` (**never** `/`)  
- [ ] Build macOS `.app` + `.dmg`; replace `/Applications/AgentSam Local Studio.app`  
- [ ] Prove cold launch opens `/agentsam`  
- [ ] Do **not** redesign Workbench or bundle Vite app in this slice  

### C2. One identity authority

```text
auth_users → one canonical account
  ├── Local Studio preferences
  ├── provider vault
  ├── terminal connections
  └── app/product state
```

- [ ] No Tauri auth DB; no Local-Studio-only accounts  
- [ ] Hosted Studio uses `GET/POST /api/auth/{me,login,signup,logout}` + `/api/oauth/*`  

### C3. Existing-user signup UX

- [ ] `email_already_registered` → “An account already exists. Sign in instead.” → `/auth/login?next=/agentsam`  
- [ ] Preserve `next=/agentsam` through signup/login/reset/Google/GitHub/Cloudflare/logout  
- [ ] OAuth-only users: offer provider login / password-setup — **not** “create another account”  
- [ ] Auto email-link only when provider **verified** email ownership  

### C4. Thin desktop auth adapter

- [ ] session status · begin login · finish callback · logout  
- [ ] System browser → IAM portal → one-time `agentsamstudio://callback?code=…`  
- [ ] Deep link = **single-use code only** (no session cookie / API key / OAuth token in URL)  
- [ ] Reuse existing Rust deep-link plumbing  

### C5. Real installer surface

- [ ] Canonical: `npx @inneranimalmedia/agentsam-sdk app install local-studio`  
- [ ] `curl …/install/studio | bash` → same machinery  
- [ ] Preserve old `--app studio` CLI-launcher behavior if needed for compat; add explicit **desktop** mode  
- [ ] Do **not** publish `apps/local-studio` (private 0.0.0) to npm as the app  
- [ ] Optional later: tiny `@inneranimalmedia/agentsam-local-studio` shim  
- [ ] Commands: `app install|doctor|open|uninstall local-studio`  
- [ ] Installer: OS/arch → download → digest/signature → install → receipt → register → doctor  

### C6. Release truth

- [ ] Receipt distinguishes `dev_unsigned` | `signed` | `notarized`  
- [ ] Use `desktop_shell_releases` / `agentsam-desktop-updates` / R2 — no second release backend  
- [ ] If Worker/table not live → **blocked step**, not fake success  

### C7. Acceptance — Connor / newuser123

Prove clean-user path; return SHA in/out, artifact paths, installer command, new-user + existing-IAM + OAuth results, signing state, blockers.

Non-goals this slice: agentsamd, bundled offline UI, updater redesign, new auth framework.

---

## D. Machine-first apps / world-state / Clack catalog

**Docs already land:** `docs/MACHINE_INTELLIGENCE.md` + plans under `docs/plans/*2026-09-24*`.

### Acceptance (without a model)

1. [ ] List every `apps/*` with calculated maturity + provenance + verify  
2. [ ] `agentsam inspect` harvested site **and** serious app → **world-state** envelope  
3. [ ] Answer what/where/contents/capabilities/reusable/missing/verified/next from receipts  
4. [ ] Decision primitives + confidence-policy receipt on ≥1 path (extend existing `src/sam/decision/`)  
5. [ ] `agentsam mini` still works  
6. [ ] Docs state ladder + MINI/APP/WORLD — **scaffold done**; keep help copy aligned  

### Batch order

| Batch | Work |
|-------|------|
| A | Decision receipt on maturity/brand path (docs done) |
| B | World-state envelope; expand `listAppManifests` to `.agentsam/app.json` + bare dirs; maturity engine; strengthen `verify:*` |
| D1 | Clack `agentsam apps` menu (Preview/Info/Doctor/Scaffold/Deploy maturity-gated) |
| C | Paste/path/stdin ingest → world-state (not toy fixtures) |
| D2–D3 | Curated distribute; demote mini as poster |

### CLI gaps (from tonight’s inventory)

| Gap | Action |
|-----|--------|
| No `agentsam app add` / `app install` | Add for desktop + scaffold; feature add stays top-level `agentsam add` |
| World-state = marketing phrase | Converge snapshot + merkle + brand + verify + maturity |
| Maturity engine missing | Calculated gates only |
| Theme apps invisible to `listAppManifests` | Discover `.agentsam/app.json` |
| D1 `agentsam_products` / `asset_relationships` | Wire remote upsert (local-projection only today) |
| No `/v1/scan` | Inspect first; scan shares engine later |
| Wasm `--cloudflare-wasm` | Reserved; not this week unless unblocked |

Non-goals: toy demos as proof; auto-fetch remotes; execute imported HTML; TypeSafe vocabulary.

**UI contract:** `AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md` = implemented (`ctrl-c`). Codex-TUI file = observational (`esc`).

---

## E. Project Control TUI (separate track — do not conflate)

Still **not** the shipped tabbed ANSI Project Control product. Primitives exist (`work-graph`, `src/ui/cli/*`, activity.v1 in-memory). Branch `feat/project-control-workbench-20260925` remains open.

Tomorrow only if bandwidth after A–D:

- [ ] `AgentSamProjectSnapshot` contract  
- [ ] Persist `agentsam.activity.v1` (SQLite) — activity is **in-memory** today  
- [ ] Local SQLite GOAP adapter (stop defaulting user GOAP to `inneranimalmedia-business`)  
- [ ] CLI TUI tabs under `src/ui/cli/tui/` (picocolors; no Ink)  

---

## F. Hygiene / ops

- [ ] Push/PR any leftover worktrees after review (`project-control`)  
- [ ] Optional: clean stale `/Users/samprimeaux/agent-worktrees/*` clones  
- [ ] Confirm published SDK version vs docs (`2.6.4` installables; bump notes if needed)  
- [ ] Site: `npm run site:publish` uses `--remote` (fixed) for Learn/ASFB assets  

---

## Suggested tomorrow morning order

1. Settings visual signoff (A) — 30–60m  
2. Identity donor audit + signup UX (B5 + C3) — unblocks Connor  
3. Machine-first Batch B discovery + stub maturity (D) — unlocks honest `agentsam apps`  
4. Desktop rebuild cold-launch proof (C1) if installer is the day’s P0  
5. Settings read-only adapters (B2) only after A signed off  

**Do not** start D1 vault migration and desktop notarization and world-state rewrite in the same PR.
