# AgentSam SDK reconciliation — 2026-09-19

**Status authority for the next agent.** Older notes (including
`ASTRA-BRIEF-2026-09-18.md`) are backlog/reference only. Do not treat them as
a live status report.

Repo: `/Users/samprimeaux/agentsam-sdk`

## Repository truth (verified this pass)

```text
git fetch --all --prune
HEAD / origin/main: 88cb30daadf20b8ca22aad29dad826055cec6998
branch: main...origin/main (clean, in sync)
untracked (intentional): docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md
```

Latest merge: **PR #51** — local-first / project-owned SQLite runtime
(`fix/model-picker-cursor-portable-catalog-20260918` → `88cb30d`).

No `npm publish`. No Worker deployment for that batch.

### Worktrees (run `git worktree list` before create/delete)

| Path | Branch | Tip |
| --- | --- | --- |
| `/Users/samprimeaux/agentsam-sdk` | `main` | `88cb30d` |
| `/Users/samprimeaux/agent-worktrees/studio-auth-ai-wiring` | `feat/studio-auth-and-ai-wiring` | `b8fffbb` |
| `/Users/samprimeaux/agentsam-sdk-errors` | `feat/errors-v1-runtime-contract` | `f39b92b` (local; remote ahead elsewhere) |
| `/Users/samprimeaux/agentsam-sdk-errors-integrate` | `integrate/errors-v1-main` | `0136a96` |
| `/Users/samprimeaux/agentsam-sdk-tui-oauth` | `feat/cli-oauth-tui-productization` | `3a86138` (remote gone; tip is ancestor of main) |

### Parallel remote branches to inspect before rebuilding equivalent work

| Branch | Ahead of main | Behind main | Merged? |
| --- | ---: | ---: | --- |
| `origin/feat/studio-auth-and-ai-wiring` | 1 | 7 | No |
| `origin/docs/cms-scaffolding-pattern-reference` | 4 | 9 | No |
| `origin/fix/connections-binding-evidence` | 11 | 7 | No |
| `origin/feat/errors-v1-runtime-contract` | 56 | 207 | No — do not casually rebase |
| `origin/integrate/errors-v1-main` | 40 | 196 | No — do not casually rebase |
| `origin/release/2.6.2-auth-closure` | 0 | 13 | **Yes** (ancestor of main) |

Do **not** publish npm, deploy Workers, delete worktrees, or rewrite branches
without explicit approval.

---

## A. MERGED / PROVEN

1. **PR #51 storage / local runtime authority** at `88cb30d`
   - Project-owned SQLite is the default local runtime authority
     (`docs/architecture/STORAGE.md` + `test/integration/storage-architecture.test.mjs`).
   - Durable Objects are **not** required for ordinary local session/runtime state;
     reserved as optional future actor adapter.
   - Existing app infrastructure (D1/Hyperdrive/R2/etc. when the project declares them) is respected.
   - CLI sessions share the versioned project DB; project switches change storage authority.
   - Raw prompts / credential fields excluded from persisted session state.
   - Codex reported `npm run verify:release` green (335 Node tests) + PR CI + `git diff --check`.
   - No npm publish / Worker deploy in that batch.

2. **Storage Architecture Law** — implemented, not theoretical. Keep the commentary:
   AgentSam may use Cloudflare/D1/Hyperdrive when the user/app chooses them; it must
   not silently invent a distributed DO dependency for ordinary local runtime state.

3. **`release/2.6.2-auth-closure`** — fully merged into main (tip `4ac7c08` is ancestor).

4. **Legacy TUI OAuth branch** (`feat/cli-oauth-tui-productization` @ `3a86138`) —
   ancestor of main; remote ref gone. Do not re-open as “unmerged OAuth work.”

5. **`packages/work-graph`** — present on main (Astra extraction item closed).

6. **`agentsam help all`** — **works on current main.** Routed via
   `src/ui/cli/help.js` (`all` / `--all` → `renderAllHelp`). Live check:
   `node src/cli.js help all` exits 0 and prints the full topic map.
   Older “unimplemented / fuzzy→runtime” findings are superseded.

7. **`workerApiTemplates` `dbKind` / Hyperdrive** — current main emits the selected
   contract; `test/integration/scaffold-cloudflare.test.mjs` passes (d1 vs hyperdrive
   wrangler/SQL/deps assertions). Treat prior “still wrong” notes as superseded unless
   a new failing repro appears.

8. **Local main == origin/main** at `88cb30d`.

---

## B. OPEN / CONFIRMED

1. **`docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md`**
   - Still **intentionally untracked**.
   - PR #51 did **not** close interactive CLI/TUI work. Storage ≠ UI.

2. **`terminal_remote` / remote exec host enrollment**
   - **Not** the old CLI OAuth identity bug (that was fixed by paired IAM/SDK work).
   - **Do not** assume PR #450 (or auth-closure) fixes this.
   - Prior live evidence on the remote exec host:

     ```text
     control_plane_auth_mode: platform_bridge
     control_plane_auth_error: platform_identity_missing

     connection_key_set: false
     platform_bridge_key_set: true
     machine_key_set: true

     account_id: null
     connection_id: null
     instance_id: null
     ```

   - Diagnosis: remote host **enrollment / pairing / provisioning** gap
     (`connection_key_set=false` + null account/connection/instance), not token-shape OAuth.

3. **Parallel work to inspect before rebuilding**
   - `feat/studio-auth-and-ai-wiring` (1 commit ahead) — auth portal + AI fallback in local-studio.
   - `docs/cms-scaffolding-pattern-reference` (4 commits) — CMS pattern reference docs.
   - `fix/connections-binding-evidence` (11 commits) — Worker binding evidence / Wrangler tunnels.
   - Errors branches are large and divergent; inspect only with an explicit errors mission.

4. **Broader architectural backlog** (still legitimate, not tonight’s batch):
   legacy runtime island, tool-authority duplication, command-dispatcher drift,
   vocabulary/`workspace_id`, lineage object, `architecture/modules.yaml` — see Astra §2
   as reference, not as current sprint status.

5. **Scaffold-from-real-app** (`apps/client-cms-editor`, `apps/cad-creator` vs thin
   `scaffold cms`) — still a design gap; do not rebuild blind.

---

## C. STALE / SUPERSEDED

| Old claim | Why superseded |
| --- | --- |
| `main is now at 0795d92 (PR #50 merged)` | Main is `88cb30d` (PR #51). `0795d92` is PR #50 only. |
| Storage architecture is “opinion / still deciding DO vs SQLite” | Implemented + release-verified on main. |
| `release/2.6.2-auth-closure` still open / blocking | Merged into main. |
| `platform_identity_missing` will be fixed by finishing auth-closure / CLI OAuth | Separate from remote host enrollment; OAuth path already closed. |
| `agentsam help all` absent/broken in `src/cli.js` | Implemented in `src/ui/cli/help.js`; verified live. |
| `packages/work-graph` still orphaned in agentsam-lab | Package exists on main. |
| dbKind/Hyperdrive scaffold “still unresolved” (without new repro) | Tests pass on main for selected db contract. |
| Treat Astra brief as ground truth over live git | This file is status authority; Astra is historical. |

---

## D. Proposed next implementation batch (narrow)

**Do not redesign storage.** PR #51 closed that.

### Recommended SDK batch — Interactive CLI presence (Cursor)

Mission: implement the gaps in
`docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md` against
`src/ui/cli/activity.js`, `src/ui/cli/footer.js`, `src/commands/shell.js`.

Constraints:

- Explicitly **incorporate** that draft only when Sam says to track/commit it.
- Until then: read it, implement against it, leave the file untracked unless told.
- Before overlapping auth/studio UI: skim `feat/studio-auth-and-ai-wiring` (1 commit).
- No npm publish, no Worker deploy, no worktree deletes, no branch rewrites.

### Separate platform track — remote terminal enrollment (not “another OAuth fix”)

Only when Sam prioritizes it:

1. On the remote exec host, reconfirm the fingerprint above
   (`connection_key_set=false`, null account/connection/instance).
2. Fix pairing/provisioning so the host gets a real connection identity under
   `platform_bridge`.
3. Do **not** reopen CLI OAuth / PR #450 as the presumed fix.

### Explicit non-goals for the next agent

- Storage architecture redesign / DO defaulting
- Broad “full-system audit”
- Blind rebuild of CMS scaffold, studio auth, or connections binding without
  inspecting the existing branches
- `npm publish` / Worker deploy without approval
