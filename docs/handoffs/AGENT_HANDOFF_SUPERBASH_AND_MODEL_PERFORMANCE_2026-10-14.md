# Agent handoff: land Superbash, make AgentSam models capable, make runs observable

Branch: `feat/sam-superbash-local-runtime-20261015` (worktree `~/agent-worktrees/sam-superbash-local-runtime-20261015`). Finish in place on this branch. Do not open new branches for this work. Prune the branch and worktree once merged.

## Goal

When Sam boots `agentsam` in a project and picks a model, that model must be MORE capable than in a plain chat, because it has his machine, his repo and the SAM tools (`sam.superbash`, `sam.script.save/get`, repository, media, etc.). Today the opposite happens: the same model that is excellent in Claude chat behaves poorly inside AgentSam. Fix the cause, prove it with measurements, and leave a loop that keeps improving it without Sam hand-testing external agents.

Standing rules (from Sam, apply to every change):
- SDK-first. Portable behavior lives in `agentsam-sdk`. IAM and MCP stay thin hosts. Do not grow parallel execution engines elsewhere.
- Anything shipped must work for a random installer: no hidden env vars, no Sam-specific ids/emails/paths, config in one clean source (the app manifest), no half-baked setup. Fix portability leaks in the same pass.
- No `.bak` copies; git is the backup. Prefer TypeScript for new code. No new tables or lookup tables; reuse existing ones.
- AgentSam capabilities only act when the user asks in that turn (no unprovoked autonomy).
- Naming: where inneranimalmedia provides identity/OAuth, spell it `inneranimalmedia` (never `iam`).

## State of the Superbash branch (audited 2026-10-14)

DONE and tested (29 of 29 pass: `node --test test/integration/sam-superbash-local.integration.test.mjs test/integration/sam-shell-runtime.test.mjs src/sam/operation-packs/generated-v2/test/*.test.mjs`):
- `src/sam/adapters/local-script-runtime.js`: Bash `-e -o pipefail`, no rc files, restricted env (no API keys), cwd verified against project root incl. symlinks, 120s default / 300s max timeout, 256 KiB output (1 MiB max), 2 concurrent runs per host process, structured failures only.
- `src/sam/adapters/local-script-store.js`: immutable versioned scripts in `~/.agentsam/scripts/account/actor/installation/scriptId`, mode 0600, compare-and-swap, SHA-256 integrity.
- Operations `sam.superbash`, `sam.script.save`, `sam.script.get` registered through `createShellSamAdapter`; exposed only with a trusted identity and Bash on PATH. Approvals are per script + working directory. Subpath export `@inneranimalmedia/agentsam-sdk/sam/local-execution`. Doc: `docs/engineering/SUPERBASH_LOCAL_RUNTIME.md`.
- Branch is based on current `main`, merges cleanly.

KNOWN GAPS (documented in the doc): no cross-process concurrency queue; `idempotencyKey` is a hint only; Bash is not a sandbox (real isolation needs a separately consented executor); Local Studio / desktop does not dispatch these tools yet (`git grep sam.superbash -- apps packages` returns nothing).

GIT STATE TO FIX FIRST: local `e1ebf0e0` and `origin/feat/sam-superbash-local-runtime-20261015` (`46a907f0`) are two commits with identical content and the same parent. Run `git reset --hard origin/feat/sam-superbash-local-runtime-20261015` in the worktree (no force-push). Then commit this file.

## Why models feel "dumb" in AgentSam: evidence from the code (hypotheses until measured)

All paths below are in this repo.

1. Tool visibility (strongest suspect). `src/agent/responses-runner.js` `buildAgentToolSurface()` calls `searchToolCards(catalog, objective, { maxItems: options.maxTools ?? 8 })` then `hydrateToolSchemas(..., { maxTools: 8 })`. The model only sees up to 8 tools, chosen by a keyword scorer (`src/tools/search.js`) run against the user's objective text. There is no model-callable tool-discovery tool (grep for `tool_search|search_tools|discover_tools` finds none). A task like "fix the failing build" may never score `sam.superbash` into the top 8, so the model cannot use a capability that exists. `resolveCapabilityFallback()` only rescues tools the model already named.
2. Thin instructions. When `options.instructions == null`, the system text is project card + resolved context + `.agentsamrules` (`compileAgentInstructions` in `src/lib/agent-instructions.js` reads only the runtime contract and `.agentsamrules`). There is no capability playbook: nothing tells the model how to plan, when to use shell vs repository tools, how to verify, or how to read tool failures. If a project has no rules file the model gets almost no behavioral guidance.
3. Anthropic adapter defaults (`src/providers/anthropic-messages.js`): `max_tokens` falls back to 8192, no extended thinking or effort parameter, `cache_control` only on the system block (not tools or rolling messages). The runner is Responses-shaped, so Anthropic runs through a translation layer; verify tool_use/tool_result round-tripping, streaming and error surfacing there.
4. Intent gate (`src/agent/intent.js`): `isStandaloneKnowledgeQuestion` strips tools and project context for short general questions. Reasonable, but check false positives.
5. Run budget is fine: shell uses `runMode: 'agent'` (128 rounds, see `RUN_MODE_BUDGETS`). No-progress limit is 4.

Do not assume these are the causes. Measure first (workstream C1).

## Workstreams, in order

### A. Land Superbash
1. Reset worktree to origin (see above), commit this handoff, push.
2. Open the PR: `https://github.com/SamPrimeaux/agentsam-sdk/pull/new/feat/sam-superbash-local-runtime-20261015`. Run the full test suite and `npm run release:train:check` if the package version needs aligning. Merge, then prune branch and worktree.

### B. Make the tools actually usable in the products
1. Local Studio: bind `sam.script.save/get` and `sam.superbash` to the in-app AgentSam dispatcher through agentsamd (the existing terminal is agentsamd-backed). Reuse `createShellSamAdapter` / `src/sam/local-execution.js`; do not write a second runner in `apps/`. Approval UI must show the exact script and cwd. Web (no local host) must show the tools as unavailable, never fall back to a remote runner.
2. Add a host conformance test that the CLI and Local Studio expose the same operation set for the same identity.
3. Optional hardening if time remains: cross-process concurrency limit; do NOT claim exactly-once for `idempotencyKey`.

### C. Model capability and observability (the main objective)
C1. Baseline (do before changing anything). Build a fixed suite of 10 to 15 realistic tasks (fix a failing test, refactor a module, find and explain a bug, write a script and run it, multi-file edit with verification, repo question, etc.) in a throwaway fixture repo. Run each through `agentsam` with Sonnet 5.5 and one OpenAI-class model. Record per run from existing telemetry: `toolSurface.receipt` (`catalog_tools`, `hydrated_tools`, `deferred_tools`), tools offered vs tools called, rounds, no-progress stops, tokens and cost (`calculateModelCost`), final outcome (pass/fail by test). Use `src/eval/` (`live.js`, `context.js`), `src/telemetry/`, `src/receipts/`; extend rather than add a new framework. Output: a baseline table committed under `docs/eval/`.
C2. Fixes, one at a time, each judged against the baseline (revert if no gain):
 a. Tool surface: always include a small core set (read/search/edit/shell/git/`sam.superbash`/repository); raise the cap per model context window; add a model-callable `agentsam.tools.search` that hydrates additional tools on demand; keep deferred tools visible by name in the system text.
 b. A provider-aware default agent playbook in the system prompt (plan, use the right tool, verify with tests, read structured tool errors, ask only when blocked). Keep it short and versioned; honor `.agentsamrules` after it.
 c. Anthropic adapter: sane `max_tokens` for agent work, extended thinking/effort wired to run mode, `cache_control` on tools and conversation prefix, streaming, faithful tool error passthrough. Check the same for the other providers.
 d. Review `buildProjectCard` / context budget so the card is useful, not noisy.
C3. Observability and learning loop:
 - One standard run record per run (task, model, provider, tool surface receipt, tool calls with outcomes, failures, rounds, tokens/cost, verified outcome). Sink through the existing receipts sinks; local-first, host-agnostic, no required cloud account.
 - `agentsam eval` runs the suite and fails on regression versus the stored baseline; wire it into CI as an opt-in job.
 - A report that ranks: tools offered but never called, tools called but failing, tasks that stall, cost per success. Turn findings into concrete suggestions (tool card text, playbook edits, surface rules) that Sam approves. The system suggests; it never edits itself unprompted.

## Definition of done
- Superbash merged and published through the normal release train; available in CLI and Local Studio with approvals and receipts; documented gaps unchanged or reduced.
- Baseline and post-change eval tables exist; on the suite the primary models complete at least as many tasks as before with fewer rounds and fewer tool-not-visible failures; `sam.superbash` appears in the offered surface for every task that needs a script.
- Run records are produced for every run and `agentsam eval` guards regressions.
- No new parallel execution engine added under `inneranimalmedia`/IAM/MCP apps.

## Context to read first
`docs/engineering/SUPERBASH_LOCAL_RUNTIME.md`, `src/agent/responses-runner.js`, `src/agent/capability-adapter.js`, `src/tools/search.js`, `src/lib/agent-instructions.js`, `src/providers/anthropic-messages.js`, `src/sam/shell-host.js`, `src/telemetry/`, `src/receipts/`, `src/eval/`.

## ADDENDUM (2026-10-15): make the tools reliably ready and pleasant to use

Sam's report: when the tools work they are excellent, but the CLI feels clunky and he cannot count on the tools being available in whatever repo he opens. Finishing the capability work is not enough. The product must (1) be installed and current, (2) tell him exactly what is ready the moment it boots, and (3) fail loudly and helpfully instead of silently degrading. Build on what already exists: `src/cli.js` already has `doctor`, `status`, `setup`, `update`, `whoami`, plus `agentsam sam status --json`, `runtime-status`, `mini`, and `interactive`. Extend these; do not add a parallel command family.

### D. Readiness: one truth about "can I use it here, now?"
1. `agentsam doctor` is the single readiness check. It must report, for the current directory: git repo root found (also from a nested folder); `.agentsam/config.json` and `.agentsamrules` found or sensibly defaulted; identity/session valid and expiry; selected model and provider reachable; the full list of SAM capabilities with state `ready`, `unavailable (reason)` or `needs approval`, including `sam.superbash` and the script tools (Bash on PATH, trusted identity); local runtime health (agentsamd, SQLite, terminal); installed SDK version versus latest published; and any host skew (CLI, Local Studio, MCP, IAM on different SDK versions). Exit nonzero with a clear fix command for each failure. Support `--json` for CI and for the app.
2. On every interactive boot print a compact readiness banner (3 to 6 lines): repo, model, tools ready N of M, anything unavailable with the one-line reason, version skew warning. No scrolling walls of text. A degraded state must never be silent: if a tool the user expects is unbound, say so at boot and when the model tries to use it.
3. Every unavailable capability returns a structured error with a code, the reason, and the exact remedy (log in, install Bash, start agentsamd, update package). The model sees the same error text, so it can explain it instead of guessing.

### E. Fresh-install and any-repo certification (the "regardless of repo" guarantee)
1. Add a fresh-install smoke test that runs in CI and locally via `npm run smoke:fresh`: pack the SDK tarball, install it into a brand new temp directory with a clean HOME, `git init` a throwaway repo (plus a nested subfolder), run `agentsam setup`, `agentsam doctor --json`, `repository.snapshot`, `sam.script.save` + `sam.superbash` (with an approved test identity), and confirm receipts are produced. It must pass with no env vars, no Cloudflare, no IAM, no network beyond the model call (stub the model).
2. Run the same capability contract suite against four targets: `agentsam-sdk`, `inneranimalmedia`, `inneranimalmedia-cms`, and the fresh repo, through CLI, MCP and Local Studio. Same capability ids, schemas, failure codes, receipts. A new capability is not "done" until it is in this suite.
3. Version alignment gate: `doctor` and CI fail when consumers pin different SDK versions. The previous agent reported IAM locked at 2.4.1 while the SDK manifest is 2.6.12 and `docs/RELEASES.md` last records 2.6.0. Verify these facts against npm (`npm view @inneranimalmedia/agentsam-sdk dist-tags`) and the lockfiles before acting; do not trust this note.

### F. Release path (do not publish from a dirty tree)
Work lands in this order, each through its own PR into `main`: Superbash branch (this one), then the Work workspace branch (`feat/work-workspace-crud-20261014`), then Repo Intelligence consolidation into `packages/agentsam-repository` and the root `/repository` exports (no new "v2" package). Only then cut a release from a clean `main`: `npm run release:train:check`, `npm run verify:release`, `npm run release:publish:preflight`, publish, tag. Afterwards upgrade IAM's SDK dependency and lockfile, remove its duplicated algorithms, deploy IAM and the MCP Worker if they changed, and rebuild Local Studio desktop only if bundled frontend, SDK code or the native bridge changed. Record the exact versions shipped per host in `docs/RELEASES.md`.
Rules: IAM owns Cloudflare bindings, account authorization, persisted records. MCP is a thin transport. Portable behavior lives in the SDK. Preserve the already-working Repo Intelligence behavior and move it, do not rewrite it.

### G. CLI experience polish (product level)
The CLI is clunky. Do not guess: run these scripted first-run scenarios in a clean HOME and record every point of friction (extra keystrokes, unclear prompts, unexplained waits, walls of text, confusing errors, missing next-step hints): install, `setup`, first `agentsam` in a repo, choose model, ask a code question, run a task that needs a script, approve and deny an action, resume a previous session, update. Fix the top friction items first. Targets: first useful answer without reading docs; approval prompts that show exactly what will run and where; progress shown for any step over 2 seconds; consistent concise output (human by default, `--json` for machines); `Ctrl-C` always cancels cleanly and says what stopped; a visible "what just happened" summary with the receipt id after tool use; one consistent way to see model, cost and tools in play (`status`).
Keep a running `docs/product/CLI_FRICTION_LOG.md` (observed, fix, verified) so polish is cumulative and not rediscovered.

### H. Definition of done for this addendum
- `agentsam doctor` and the boot banner exist, are accurate, and are covered by tests.
- `npm run smoke:fresh` passes in CI from a clean HOME with no env vars.
- The capability contract suite passes on all four target repos and all three hosts.
- A released SDK, with IAM, MCP and Local Studio recorded at that version.
- Sam can open any of his repos, run `agentsam`, and see within seconds which tools are ready and why any are not.
