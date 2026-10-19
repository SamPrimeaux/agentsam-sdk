# SAM-001 — Canonical operation identity

Worktree branch baseline: c37123c2
Dependencies: none

## Build requirement
Inventory SAM OS, generated-v2 catalog, manifest, CLI, ACP, MCP and app registries. Establish one versioned identity+alias+owner schema and deterministic projections. Preserve existing operation names and host ownership; reject collisions, alias loops and schema drift in CI.

## Mandatory execution
1. Inspect implementation owners and registered operations before changing code.
2. Build real adapters/contracts on existing source authority, plus tests for absence, failure, denial, and actual happy path when a safe fixture exists.
3. Run relevant repo tests, npm typecheck (if applicable), Python conformance (if applicable), git diff --check, and source-boundary validation.
4. Capture status as verified / implemented-unverified / blocked. Keep blockers open, with owner and exact test needed.
5. Do not declare full ticket complete if only a mock or generated manifest passes.
6. Where usable artifacts result, return readable Markdown/HTML together with typed provenance; render must not invent findings.

Related prior reports: none

Architectural rules (mandatory):
- SAM = Systematic Autonomous Machinery; agentsam is machine API/CLI; AgentSam is AI harness; AgentSamClient is SDK facade.
- Preserve specialist authorities (IAM, SAM, ACP, MCP, CMS, Commerce, CoPro, CAD, media, agentsamd).
- Customer machine and customer's remote instance belong to that installation, never company ExecOS by default.
- Absolutely no deployment, production write, secret exposure, workspace deletion or cross-tenant access.
- Implement actual handler or honest unsupported/unbound. Generated IDs are NOT executable capabilities.
- Reuse existing tables/registries/section SKUs and artifact authority; no parallel databases.
- First inspect current code, select smallest testable patch. Write negative and positive tests. No blanket file rewrites.
- Do not edit other worktrees. Do not merge or push. Don't invent positive receipts or test results.
- Produce an implementation summary and record exact commands/results in the ticket report.


You are implementing this ticket on an already unified SDK branch. Do not generate an alternate SAM runtime or replace existing owners. You may inspect, create and edit files within this repo ONLY. Do not alter git history, branches, tokens, environments, or deployment. Preserve the untracked .sam-gap-build directory. Add executable deterministic tests for identity collisions, alias loops and projection drift. If full cross-host parity cannot be proven, implement the bounded truthful improvement and report exact remaining gaps. Do not mark ticket completed without verifying actual code behavior. Return concise file-by-file summary and commands for independent tests.
