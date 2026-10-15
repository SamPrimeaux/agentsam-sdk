# AgentSam Plan portability — first integration sprint

## Source of truth
- Durable state remains in the existing agentsam_plans and agentsam_todo SQLite tables (src/commands/plan-ledger.js). There are no new planner tables, parallel plan stores, migrations, or repo-specific fixtures.
- The existing SAM GOAP adapter (src/sam/operations/planning-goap.js) calls the existing A* engine. It generates a dry-run proposal, not an automatic execution or a persisted Plan.
- CLI and SDK agent capability handlers share the same plan-ledger functions.

## Portable initialization
- agentsam plan list --cwd REPO --json returns [] in an uninitialized Git checkout.
- agentsam plan show --cwd REPO --json returns null.
- agentsam plan next --cwd REPO --json returns selection=uninitialized.
- Reads do not create .agentsam, a SQLite file, or mutate configuration; existing databases are opened read-only without migrations.
- Explicit mutations create the existing repo-local SQLite ledger without requiring a project config or initializing unrelated providers or pipelines.
- Repository identity remains enforced even with an explicitly configured shared SQLite path.

## Model surface
Read-only: plan.list, plan.show, plan.next, planning.goap.
Write (requires authorization): plan.create, plan.step.add, plan.step.status, plan.step.evidence, plan.step.accept, plan.step.depends, plan.status.

These operations are SDK capability declarations. They use the existing capability search, describe, status, invoke and runner beforeTool authorization; there is no separate tool catalog.

Plan steps cannot start or complete while dependencies are incomplete. Dependency cycles, self-reference, and cross-plan references are rejected. Completion requires declared acceptance criteria and existing registered evidence; plans cannot be completed with unfinished steps.

Model results are bounded: plan.list reports count and the first 30 plans, plan.show reports task_count and up to 80 tasks with truncated flag. The CLI/SQLite remains the full-state authority.

## Earlier SAM work and remaining acceptance
SAM v2 registered planning.goap and planning.astar. Raw A* expects JavaScript callback functions and is unsuitable for a plain JSON model tool. The GOAP wrapper accepts declarative states/actions and is exposed through the SDK.
Generated v2 Superbash and media operations are intentionally host-bound to explicit runtime/identity/authorization; unavailable handlers are not assumed installed or removed.
Earlier discovery/repository-knowledge PR #225 is still a separate draft; reconcile adapter/manifest conflicts if merging both.

Acceptance:
  npm run verify:registry
  node --test test/cli/plan-ledger.test.mjs test/cli/plan-portability.test.mjs
  node --test test/cli/goap-local-world.test.mjs test/integration/sam-kernel.test.mjs test/integration/tool-schema.test.mjs test/agent-capabilities.test.mjs test/responses-runner.test.mjs

Not yet certified: live paid-model planning choice, hosted MCP plan projection, packaged Local Studio integration, and complete unattended multi-step execution.
