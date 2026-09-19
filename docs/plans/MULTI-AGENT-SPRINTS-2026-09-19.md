# Multi-agent sprint plan — remaining AgentSam work

**Purpose:** Finish the open post-PR51 backlog end-to-end across bounded
AgentSam / Cursor Cloud Agent sessions, and produce a comparable grade for
Cursor Cloud Agent API value on real AgentSam work (not toy prompts).

**Status authority:** [`RECONCILIATION-2026-09-19.md`](./RECONCILIATION-2026-09-19.md)  
**Canonical contract:** `AGENTSAM.md` (via `AGENTS.md` shim)  
**Repo:** `SamPrimeaux/agentsam-sdk` · start every session from current `origin/main`

**Baseline after push (2026-09-19):**
```text
origin/main: 67f4a75541855d16c5baecf29007cab05512b532
  f6dafed  feat(instructions): AGENTSAM + AGENTS/CLAUDE shims
  67f4a75  docs: post-PR51 reconciliation status authority
```

**Global hard rules (every session)**

1. Read `./AGENTSAM.md` first. Do not redesign storage / invent Durable Object defaults.
2. `git fetch --all --prune` · `git worktree list` · `git status -sb` before edits.
3. No `npm publish`, Worker deploy, worktree delete, force-push, or branch rewrite without Sam approval.
4. Prefer `git worktree add` / feature branch + PR over direct `main` commits for implementation sessions.
5. Inspect named parallel branches before rebuilding equivalent work.
6. Evidence required: commands run, test output, SHAs. No “should work.”
7. Stop at the session’s Done definition — do not expand into the next session’s scope.

**Recommended models (Cursor Cloud Agent)**

| Session type | Model | Effort |
| --- | --- | --- |
| Default AgentSam implementation | Gemini 3.8 Flash | High |
| Long tool-chain / multi-branch recon | Muse Spark 1.3 1M | Medium → High if stuck |
| Already-approved mechanical apply | GPT-5.6 Terra | Fast |
| Architecture stuck / merge conflict hell | GPT-5.6 Sol | default |

**A/B grade track (optional, after S1–S2 have a golden brief):** run the *same*
S1 brief on Gemini 3.8 Flash High vs Muse Spark 1.3 1M Medium and score both
with the rubric in §Grade.

---

## Cloud Agent API evaluation design

Each session below is a **Cloud Agent job unit**: fixed prompt, fixed repo,
fixed Done checklist, fixed grade dimensions. Run them as separate API
invocations (or sequential AgentSam CLI sessions) so you can score:

| Dimension | What to score (1–5) |
| --- | --- |
| D1 Inspect-before-invent | Opens existing files/branches before writing parallel systems |
| D2 Architecture fidelity | Honors AGENTSAM.md, storage law, session boundaries |
| D3 Tool-chain survival | Completes 15–40+ tool steps without abandoning |
| D4 Finish | Hits Done definition; opens PR or leaves reviewable branch |
| D5 Verify | Runs named tests / live CLI checks; pastes evidence |
| D6 No rebuild | Does not recreate studio-auth / CMS / connections / help-all |
| D7 Prose junk | Low fluff; high signal in final report |
| D8 Cost / latency | Tokens + wall time for the same brief (A/B only) |

**Scorecard file (create once, append per job):**
`docs/plans/CLOUD-AGENT-SCORECARD-2026-09.md` (session id, model, SHA in/out,
D1–D8, notes, PR URL).

---

## Dependency graph

```text
S0  bootstrap (track UI draft + scorecard stub)
 │
 ├─► S1  interactive presence (UI req §§1–5)
 │     └─► S2  status chrome + /model catalog surface
 │
 ├─► S3  studio-auth branch decision (parallel with S1)
 ├─► S4  connections-binding branch decision (parallel with S1)
 ├─► S5  CMS pattern docs + scaffold design (parallel)
 │         └─► S6  scaffold-from-real-app implement
 │
 └─► S7  terminal_remote enrollment (platform; may touch IAM)
         ⚠ not blocked by S1–S6; do NOT treat as OAuth

S8  optional Muse vs Gemini A/B on frozen S1 brief
S9  backlog only if capacity (errors / command manifest) — out of critical path
```

**Critical path to “remaining sprints done”:** S0 → S1 → S2 → (S3∨S4 as needed) → S5 → S6, with S7 on a platform track.

---

## S0 — Bootstrap · ~15–30 min · Terra Fast or Flash Medium

**Goal:** Make the interactive UI brief git-tracked and give Cloud Agents a
scorecard stub + updated recon tip SHA.

**Branch:** `chore/sprint-bootstrap-20260919`

**Prompt (paste into Cloud Agent):**
```text
Repo: agentsam-sdk. Start from origin/main. Read AGENTSAM.md.

1. git fetch --all --prune; git worktree list; do not delete worktrees.
2. Add and commit the currently untracked file
   docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md if present locally;
   if missing, stop and report.
3. Create docs/plans/CLOUD-AGENT-SCORECARD-2026-09.md with a table template
   (session, model, effort, sha_in, sha_out, D1–D8, pr_url, notes).
4. Patch docs/plans/RECONCILIATION-2026-09-19.md baseline SHA to current
   origin/main and note UI draft is now tracked.
5. Open a PR. No npm publish. No deploy. No other features.
```

**Done when:** PR merges (or is merge-ready); UI requirements tracked; scorecard exists.

**Grade focus:** D4 Finish, D5 Verify (file presence), D6 No rebuild.

---

## S1 — Interactive shell presence · ~1–2 h · Gemini 3.8 Flash High

**Goal:** Implement UI requirements §§1,3,5 then §2, then scope §4 — presence,
not architecture.

**Depends on:** S0 (or attach the untracked UI file in the job context).  
**Branch:** `feat/cli-interactive-presence`  
**Inspect first:** `src/ui/cli/activity.js`, `footer.js`, `src/commands/shell.js`,
existing diff helpers under `src/ui/` / `src/lib/`.

**Prompt:**
```text
Repo: agentsam-sdk. origin/main. Read AGENTSAM.md and
docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md completely.

Implement in order: §1 interrupt hint, §3 footer project+action, §5 paste-collapse,
then §2 shimmer (with truecolor/256 fallback), then §4 only after searching for an
existing diff formatter (reuse; do not reinvent).

Rules: extend existing helpers; no storage changes; no DO; no publish/deploy;
run git worktree list first; open a PR with screenshots or CLI transcript evidence.

Verify: node --check on edited files; focused tests if present; manual
`node src/cli.js` interactive smoke notes in the PR.
```

**Done when:** All five sections addressed (§4 may be “reuse X + wire call sites”
if a renderer already exists); PR + evidence.

**Grade focus:** D1–D7 (primary Cloud Agent value test for TUI work).

---

## S2 — Status chrome + provider-agnostic `/model` · ~2–3 h · Flash High / Muse Medium

**Goal:** Product surface that combines Codex run chrome + Cursor model menu:

```text
project · git · contract AGENTSAM.md ✓ · runtime local SQLite ·
provider · model · effort · context · usage
```

`/model` opens scrollable provider-agnostic catalog (reuse existing models
command / account-visible catalog — do not invent a second registry).

**Depends on:** S1 footer foundation.  
**Branch:** `feat/cli-status-model-catalog`  
**Inspect first:** `src/commands/models.js`, shell slash commands, footer from S1,
`feat/studio-auth-and-ai-wiring` (1 commit) before touching studio auth UI.

**Prompt:**
```text
Build the persistent AgentSam session status strip and /model catalog UX
described in docs/plans/MULTI-AGENT-SPRINTS-2026-09-19.md S2.
Reuse account-visible models and existing provider credential surfaces.
Do not rebuild OAuth. Do not change storage authority.
Before any local-studio auth UI: git log / diff
origin/feat/studio-auth-and-ai-wiring...main and report whether to cherry-pick.
PR with before/after footer transcript.
```

**Done when:** Footer/status shows contract + runtime + model/effort/context/usage;
`/model` lists real catalog entries; tests or transcript evidence; PR.

**Grade focus:** D1, D2, D6 (highest risk of reinventing models/auth).

---

## S3 — Studio auth branch triage · ~45–90 min · Flash High

**Goal:** Decide keep/merge/abandon for `feat/studio-auth-and-ai-wiring`
(1 commit ahead / 7 behind) — no blind rewrite.

**Branch:** `integrate/studio-auth-ai-wiring` or PR from rebased tip.

**Prompt:**
```text
Inspect origin/feat/studio-auth-and-ai-wiring vs origin/main.
Summarize the single unique commit. Rebase or cherry-pick onto a fresh branch
from main if still valuable. Fix conflicts. Run relevant local-studio / auth tests.
Open PR or document “abandon because already on main” with evidence.
Do not expand into full identity redesign.
```

**Done when:** Merged PR **or** written abandon receipt with SHA evidence.

---

## S4 — Connections / binding evidence triage · ~1–2 h · Flash High / Muse Medium

**Goal:** Land or extract useful bits from
`origin/fix/connections-binding-evidence` (11 ahead) without breaking
terminal bindings; feed evidence into later terminal work.

**Prompt:**
```text
Diff origin/fix/connections-binding-evidence...origin/main.
Classify commits: merge as-is / cherry-pick subset / abandon.
If mergeable, rebase onto main, fix tests, open PR.
Explicitly state how this relates (or does not) to terminal_remote
platform_identity_missing — do NOT claim it fixes enrollment.
```

**Done when:** PR or abandon receipt; note for S7 updated.

---

## S5 — CMS pattern docs + scaffold design · ~1–2 h · Flash High

**Goal:** Merge `docs/cms-scaffolding-pattern-reference` (4 commits) and write
a short design for scaffold-from-real-app (`apps/client-cms-editor`,
`apps/cad-creator`) — design only, no generator rewrite yet.

**Prompt:**
```text
1. Rebase/merge origin/docs/cms-scaffolding-pattern-reference onto main → PR.
2. Add docs/plans/SCAFFOLD-FROM-REAL-APP-DESIGN.md answering:
   template vs fixed platform files; D1/R2/Worker per project vs shared;
   subtree vs copy-parameterize; how IMPORT_PROVENANCE.json is used.
3. Do not implement scaffold generators in this session.
```

**Done when:** Docs PR + design merged or merge-ready.

---

## S6 — Scaffold-from-real-app implement · ~2–4 h · Muse Medium/High or Flash High

**Depends on:** S5 design approval (Sam ack in PR or chat).  
**Branch:** `feat/scaffold-from-real-apps`

**Prompt:**
```text
Implement agentsam scaffold cms (and cad-creator if design says so) per
docs/plans/SCAFFOLD-FROM-REAL-APP-DESIGN.md.
Stand up parameterized instances of apps/client-cms-editor / apps/cad-creator —
do not regenerate the thin toy templates as the primary path.
Keep thin templates only if design marks them deprecated/compat.
Tests: scaffold dry-run or integration assertions; node --check; PR.
```

**Done when:** Scaffold produces real-app-shaped tree; tests green; PR.

**Grade focus:** D1, D6 (reinvention risk extreme).

---

## S7 — terminal_remote enrollment (platform track) · separate job · Sol or Flash High

**Repo note:** Likely spans `agentsam-sdk` **and** IAM / terminal host config.
Treat as Cloud Agent job against the repo(s) Sam designates; SDK-only agents
must stop at diagnosis + SDK-side receipts if host access is missing.

**Prompt:**
```text
terminal_remote fails with platform_identity_missing under platform_bridge.
Prior live evidence:
  connection_key_set: false
  platform_bridge_key_set: true
  machine_key_set: true
  account_id / connection_id / instance_id: null

This is NOT the CLI OAuth bug. Do not reopen PR #450 / auth-closure as the fix.

Mission: reconfirm fingerprint on remote exec host; implement enrollment/
pairing/provisioning so connection identity is non-null; prove
agentsam_terminal_remote (or equivalent) succeeds with evidence.
If this session lacks host credentials, produce an exact ops runbook +
SDK instrumentation PR only — do not invent OAuth token reshaping.
```

**Done when:** Live exec succeeds **or** blocked with precise missing secret/host
access listed for Sam.

**Grade focus:** D2 (correct diagnosis), D6 (no OAuth rebuild), D5 (live proof).

---

## S8 — Model A/B (optional) · same brief as S1 frozen

Run identical S1 prompt on:

1. Gemini 3.8 Flash High  
2. Muse Spark 1.3 1M Medium (escalate High only if stalled)

Fill scorecard D1–D8 + cost. Prefer the winner for S6/S7.

---

## S9 — Explicit non-goals / later backlog

Do **not** assign as Cloud Agent “finish remaining sprints” work:

- Storage / DO architecture redesign  
- Errors-v1 divergent branches (56/40 ahead, 200+ behind) without a dedicated
  errors mission  
- Full command-manifest unification / lineage object / vocabulary CI  
- `npm publish` / production Worker deploy  
- Deleting worktrees

---

## Suggested Cloud Agent schedule (calendar)

| Day | Sessions | Parallelism |
| --- | --- | --- |
| Day 1 | S0 → S1 | S3 and S4 can start after S0 in parallel |
| Day 2 | S2 · finish S3/S4 | S5 in parallel |
| Day 3 | S6 after Sam approves S5 | S7 platform track anytime |
| Day 4 | S8 A/B if desired · merge lag · smoke | — |

**Human gates (Sam only):**

1. Approve S5 design before S6.  
2. Approve any publish/deploy.  
3. Provide remote host / IAM access for S7 if agents are blocked.  
4. Pick A/B winner after S8.

---

## Session handoff packet (attach to every Cloud Agent job)

```text
AGENTSAM.md
docs/plans/RECONCILIATION-2026-09-19.md
docs/plans/MULTI-AGENT-SPRINTS-2026-09-19.md  (this file — your session id only)
docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md  (S0–S2)
docs/plans/CLOUD-AGENT-SCORECARD-2026-09.md  (append your row)
```

**Return format required from every agent:**

```text
## Session <id>
Model / effort:
SHA in / SHA out:
Branch / PR:
Done checklist: [ ] ...
Grade self-score D1–D7:
Evidence (commands + outcomes):
Stopped because (if incomplete):
Next session should start at:
```

---

## Definition of “remaining sprints done”

All of the following are true:

- [ ] S0–S2 merged (interactive presence + status/`/model` chrome)
- [ ] S3–S4 decided (merged or abandon receipts)
- [ ] S5–S6 merged (CMS docs + real-app scaffold path)
- [ ] S7 live green **or** blocked only on Sam-held host secrets (runbook filed)
- [ ] Scorecard has ≥3 scored Cloud Agent jobs (enough to grade API value)
- [ ] Still no surprise npm publish / Worker deploy / storage redesign
