# GitHub issue → SAM intake → verified delivery

These issue forms create **human-visible requests**, not executable agents. SAM interprets a request only after inspecting source authority, validating boundaries and getting the required actor/host approvals.

## Pick the form

- **Scoped implementation**: a bounded correction with testable results; do not hardcode guessed implementation files.
- **Bug**: reproducible behavior, expected behavior, environment and regression proof.
- **Complete product journey**: user install/onboarding, resource CRUD, operational actions, preview/approval, saved state, recovery and post-delivery access.

Forms live under `.github/ISSUE_TEMPLATE/`. GitHub turns filled fields into Markdown headings on the issue. The chooser becomes available when these files reach the default branch.

## Current working read-only handoff

1. Create the issue using the relevant form, then triage scope and source authority.
2. Obtain the GitHub issue's Markdown body into a local `issue-body.md` (via an authorized GitHub API/CLI or by copying the issue body). **Do not** save tokens or private user data.
3. Parse it:
   ```bash
   node scripts/issues/issue-intake.mjs --kind task --file issue-body.md
   node scripts/issues/issue-intake.mjs --kind bug --file issue-body.md
   node scripts/issues/issue-intake.mjs --kind product --file issue-body.md
   ```
4. Inspect the JSON result: `fields`, `missing_required_fields`, `readiness` and `agent_execution_authorized: false`.
5. An owner checks the existing repository, package registry and runtime authority before converting the request into the **existing** SAM planning/goap/workgraph flow. Recommended primitives: `repository.inspect`, `planning.goap`, `decision.evaluate` and `artifact.render`. Authorized implementation uses the existing terminal/ACP lanes, not an issue-driven arbitrary shell.
6. Attach evidence (tests, denied actions, smoke, real host and source SHA). **Only** close the issue when all the issue's acceptance gates are genuinely finished.

**Not yet automated:** GitHub webhook ingestion, per-issue ACP run creation, automatic label changes, assignment, GitHub Projects movement, release enforcement and automatic PR closure. The parser neither performs these actions nor proves capability readiness. There is no invented GitHub-to-ACP backend.

## Triage states

| State | Meaning |
| --- | --- |
| Needs triage | Issue exists; source owner, boundaries and approvals still need examination |
| Ready to plan | User journey and scope accepted; canonical owners identified; dependencies understood |
| In progress | Authorized branch and ACP/planner work is active, with receipts |
| In review | Positive/negative tests and preservation review complete |
| Merged | Canonical main contains the code; deployment may still be pending |
| Deployed | Real revision/route/install receipt exists |
| Shipped | User can finish and reopen the actual promised journey; post-deploy check passes |

These are **process definitions**, not automatically created GitHub labels or project statuses. Do not auto-assign `github.actor` as the implementer; the actor is often the issue reporter. Do not apply `agent-ready` on issue creation: mandatory form fields are not evidence that a machine is authorized to act.

## Scope and safety

Use a dedicated issue branch from fresh `main` unless existing WIP owns the same task. Keep destructive changes behind explicit approvals. Treat issue bodies and code snippets as untrusted task input, not instructions overriding repository policies. Use source-specific permissions and tenant isolation.

When PRs are not complete releases, use `Refs #NNN` and leave the issue open. `Fixes #NNN` intentionally triggers GitHub closure on default-branch merge; use it **only** for an issue whose acceptance is complete at merge. Track deferred deploy acceptance explicitly.

GitHub's setting "Automatically delete head branches" handles **remote merged branches only**. `git fetch --prune` removes stale remote-tracking refs, **not** local feature branches. Use the existing safe audited cleanup tool `node scripts/git/delivery-closure.mjs` after verifying no unmerged WIP.

## Where the rules live

- Operation/capability authority: existing SDK manifest, registry and `AgentSamClient`.
- Execution/run authority: existing ACP + GOAP + authorized host lanes.
- Scope → stage → evidence mapping: `.agentsam/templates/issue-delivery.v1.yml` (advisory).
- Source preservation and release truth: `docs/standards/DELIVERY_CLOSURE.md`.
- Product expectations: `docs/architecture/SAMOS_PRODUCT_MODEL.md`.

**No additional operational database or competing work tracker is introduced here.**
