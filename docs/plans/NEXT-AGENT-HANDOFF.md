# Next-agent handoff — stack on inventory PR

**Read first:** `AGENTSAM.md` · this file · open PR branch below  
**Do not** start from stale Astra notes. Do not redesign storage. Do not invent DOs.

## Where we are (2026-09-19)

```text
Branch (pushed): feat/per-user-model-inventory-dist @ dc24e62
Open PR:         https://github.com/SamPrimeaux/agentsam-sdk/pull/new/feat/per-user-model-inventory-dist
                 (gh auth was 401 last push — create/merge PR if not open yet)
main tip before this work: 5affb1f (recon + AGENTS shims + sprint plan)
verify:release:  PASS on this branch
```

Commits on the branch (do not redo):

1. Cursor in `API_PROVIDERS` + live discovery  
2. Shared `src/models/inventory-core.js`  
3. Studio inventory picker + fail-closed `{provider, model_id}` chat  
4. `/usage` panel + activity chrome  
5. `agentsam app` + CMS/Studio manifests/bins  
6. `scripts/install.sh` npm-bootstrap installer  

Untracked (leave unless Sam says incorporate):  
`docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md`

---

## Critical correction — “platform” is not a stub

Local Studio **already ships with real production bindings and secrets**.
`credential_plane: platform` means **desk/org Worker secrets + bindings**, not
“we haven’t set anything up.”

### Documented production surface (`agentsam-sdk` Worker)

**Bindings (honor these):**

| Binding | Type | Value |
| --- | --- | --- |
| `AGENTSAM_WAI` | Workers AI | catalog |
| `DB` | D1 | `inneranimalmedia-business` |
| `EXECOS` | Service | `execos` |
| `HYPERDRIVE` | Hyperdrive | supabase hyperdrive |
| `PTY_SERVICE` | VPC Service | `iam-vpc` |
| `WEBSITE_ASSETS` | R2 | `agentsam-os-blueprint-content` |
| `ASSETS` | Assets | `.output/public` |

**Runtime secrets/vars already present (do not print values):**

- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CURSOR_API_KEY`
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_OAUTH_*`, break-glass admin token
- `AGENTSAM_BRIDGE_KEY`
- `IAM_CLIENT_ID` / `IAM_CLIENT_SECRET` / `IAM_OAUTH_ISSUER`

So Studio inventory/chat **can and should** discover models from these
platform credentials today. That is intentional desk authority.

### What is still missing (your job)

**Layer vault BYOK on top of platform — prefer vault when the logged-in user has it.**

```text
authenticated session
        │
        ▼
  user_id / account_id
        │
        ├─► D1 user_secrets unwrap (DB + VAULT_MASTER_KEY)  → source: user_vault
        │         preferred per provider when present
        │
        └─► else platform Worker secret / AGENTSAM_WAI      → source: platform
```

Hard rules (unchanged):

- Never read `~/.agentsam` from Studio.  
- Never return secrets to the browser.  
- Never silently swap providers (no XAI→OpenAI).  
- Selection stays `{ provider, model_id }`.  
- Sam’s machine `env.d` ≠ Connor’s Studio options.

Worker already has vault routes + `GET /api/llm/inventory` provenance.  
TanStack `/api/llm/inventory` + `/api/chat` currently use **platform** via
`apps/local-studio/shared/agentsam/src/studio-inventory.ts`.

**Next implementation slice:** bind IAM/browser session → `user_id`, unwrap
that user’s `user_secrets` server-side, merge vault-over-platform into
`buildStudioInventory` / chat credential resolve. Reuse
`apps/local-studio/backend/worker/index.js` vault decrypt path — do not invent
a second vault.

Inspect before rebuild:

- `feat/studio-auth-and-ai-wiring` (worktree) — **auth portal / session gate only**;
  **reject** any XAI→OpenAI chat fallback hunk.

---

## Exact next batches (pick one, finish it, PR)

### A — Session→vault inventory (highest leverage) · Flash High

1. Checkout `feat/per-user-model-inventory-dist` (or merge it to main first if Sam approves).  
2. Wire Studio auth session so inventory/chat get a real `user_id` (not `studio-local`).  
3. Server-side: vault unwrap for that user → merge over platform credentials.  
4. Prove: user A inventory ≠ user B; secrets never in JSON; mismatch still 409.  
5. Route Cloudflare curated models through `env.AGENTSAM_WAI` when provider is
   `cloudflare` / Workers AI lane (binding already exists).

### B — Auth portal live · Flash High

1. Inspect `feat/studio-auth-and-ai-wiring` vs main.  
2. Cherry-pick **portal + Worker identity routes only** (no AI fallback).  
3. Prove `/auth/login` `/auth/signup` `/auth/reset` on Studio host.  
4. That unblocks A’s session→user_id.

### C — Host `/install` · Terra Fast / Flash Medium

SDK already has `scripts/install.sh`. IAM/host must serve:

`GET https://agentsam.inneranimalmedia.com/install` → that script body.

App selectors: `/install/cad` `/install/cms` `/install/studio` (same engine, different `--app`).

### D — Interactive UI polish · Flash High

Use untracked `docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md` against
activity/footer/shell (partially done by `/usage` commit). Finish interrupt
hint / paste-collapse / shimmer if still open — extend, don’t rebuild.

---

## Do not touch / already done

| Item | Status |
| --- | --- |
| Project SQLite storage / no default DOs | Done (PR #51) |
| `agentsam help all` | Works on main |
| Cursor machine discovery | Done on this branch |
| Static Studio Grok-only menu | Replaced on this branch |
| `agentsam app` manifests | Done on this branch |
| npm publish / surprise deploy | Forbidden without Sam |

---

## Operating rules for this handoff

1. `git fetch --all --prune` · `git worktree list` before create/delete.  
2. One focused PR; keep stacking on `feat/per-user-model-inventory-dist` unless merged.  
3. Run `npm run verify:release` before claiming done.  
4. End with: SHA, tests, remaining blockers with evidence, next slice letter (A/B/C/D).  
5. If blocked on IAM session cookies / vault master key / deploy, stop with exact missing access — don’t invent OAuth reshapes.

## Return format

```text
## Session
Slice: A|B|C|D
SHA in / out:
PR:
Done:
Evidence:
Blocked (if any):
Next slice:
```
