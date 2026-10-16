# SAM + InnerAnimal Experience — swarm dispatch cards

**Status:** PROPOSED agent job definitions. **Do not start these tasks solely because this document exists.**
**Parent workflow:** docs/plans/SAM_MACHINERY_TO_EXPERIENCE_2026-10-15.md
**Reference fixture:** docs/reference/INNERANIMALMEDIA_EXPERIENCE_ACCEPTANCE_2026-10-15.md
**Instructions:** AGENTSAM.md + .agentsamrules + docs/architecture/SAM_KERNEL.md + relevant package contract.

## Dispatcher rules

- Integration lead first verifies current origin/main, all worktrees/PRs, outstanding intentional changes, and authoritative package/branch owner; do not overwrite parallel agents' work.
- Every agent gets a separate working tree/branch and base SHA; no direct write on main, no forced branch cleanup, no unstated architecture change, no publish/deploy unless authorized.
- First round starts **S0 read-only**, **S1 tests/contract audit**, and **S2 knowledge evidence discovery**; actual SAM mutation follows owner review and non-overlap.
- Only the designated contract owner may edit src/sam types/schemas/registries; other agents document required changes and depend on its accepted PR.
- The reference brand case is never copied as data into the portable SDK.
- Every card requires final result: OBSERVED / PROPOSED / IMPLEMENTED / VERIFIED / BLOCKED, named owner, evidence, test command, changed paths, SHA, reason if blocked.

## A0 — Source authority and integration captain

**Scope:** docs, plans, inventory, evidence only; no code edits initially.

**Brief:** Establish the exact current SDK and site revisions; inspect active worktrees and overlapping PRs, protected creative sources, the founder brand-guide authority, the packaged vs globally installed CLI, and the real work-globe scene origin/preview/deployed relations. Produce an ownership map, artifact manifest and non-overlapping assignment matrix.

**Exit:** One source-of-truth path per subsystem; baseline evidence; zero source/asset mutation; gate approval for A1/A2 implementation.

## A1 — SAM kernel correctness owner

**Scope:** src/sam/os.js, client.js, define.js, result.js, registry.js, model-adapter.js plus existing SAM schemas/contracts (only this agent changes those).

**Brief:** Reproduce the prior kernel audit defects on **current** main: incorrect repository default root, direct privileged invocation without universal policy, missing core runtime schema enforcement, hardcoded lane/model/usage receipt values, non-atomic partial registration, and mismatched schema hydration/discovery. Build a compatibility-first fix through the existing runtime contract, not another kernel or database.

**Tests:** negative denial; invalid input/output; remote-only mock must not report local; config cwd vs process cwd; atomic install; valid operation discovery from CLI and model adapter; existing SAM kernel/CMS/GOAP tests.

**Exit:** Fail-safe execution and truthful metadata through all supported entrypoints. No unexpected public API break or provider spend.

## A2 — Repository and warm-start evidence owner

**Scope:** packages/agentsam-repository, native/agentsam-machine adapters, src/knowledge existing engine; no src/sam registry change without A1 owner integration.

**Brief:** Trace real repository identity, Merkle snapshots, native crawl, Knowledge index, existing historian and AutoRAG. Prototype **scoped** source-aware retrieval with content hashes and truthful freshness. Evaluate multiple checkout branches plus a fresh unrelated repo and missing hosted index. Do not create an independent universal data store.

**Tests:** cold vs warm scan timing; deterministic repeat hashes; changed-file invalidation; query with bounded context; no cloud dependencies for local structural retrieval; no hallucinated ready status.

**Exit:** A previously indexed symbol and decision can be recalled on a second session with evidence; remote index remains optional.

## A3 — GOAP/Plan/Work execution bridge owner

**Scope:** agentsam-goap, existing Plan ledger, Work Graph projections, existing SAM public invocation contract; wait for A1's accepted dispatcher contract.

**Brief:** With a *real but safe* project task, map grounded state to packaged GOAP action facts, translate to current A* solver, materialize an approved Plan action with dependencies, run an authorized bound operation, record receipt, verify observed result and update blackboard. Avoid any second ticket or GOAP database.

**Tests:** failed preconditions, approval denial, stale index, interrupted run, uncertain write not repeated, task reopened from ledger.

**Exit:** One end-to-end authorized and recoverable workflow with shared task/goal/repo/run identities.

## B0 — Founder-directed Brand evidence researcher

**Scope:** read-only brand guide/source archives, agentsam-brand Scan/BrandPack/contract APIs, Assets Core; **no edits to founder guide or original media**.

**Brief:** Trace decisions before prompts. Distinguish approved company identity, active designs, historical identity, experiments, donor research and possible assets. Assess whether Brand can scaffold positioning, story, Atlas journey and visual system without making colors or provider defaults authoritative. Map missing behaviors to existing owners.

**Tests:** mixed-archive provenance; source hash protection; same symbol in historical and active media not silently promoted; founder veto preserved; output readable by the user.

**Exit:** Reviewable evidence packet and minimal implementation gaps. **Do not generate a replacement brand from scratch.**

## B1 — Original scene and interactive source auditor

**Scope:** inneranimalmedia/packages/iam-section-work-globe originals, viewer, embeds; separate experimental branches for derived work. No changed original byte.

**Brief:** Inspect source and deployed work-page behavior: globe/halo, five-card sequence, scroll progress, source-fidelity, viewer controls, responsive, typography contrast, focus/keyboard, reduced motion, WebGL lifecycle. Record which UI controls are viewer-only and whether CMS edit/save/preview/publish is truly wired.

**Tests:** source SHA preservation, original frame build/check, scene unit tests, browser screenshots/video across meaningful viewports, offscreen/pause behavior.

**Exit:** Specific defects and one proposed narrative/interaction refinement tied to a real visitor need. Do not create a new random sculptural object or broad effects gallery.

## B2 — Experience designer + asset/CMS integrator

**Start condition:** A1/A2/A3 integration gate accepted; B0 founder direction approved; B1 original audited.

**Scope:** authorized creative derivatives, existing CMS/theme sections, Brand/Assets/CoPro/Content hosts.

**Brief:** Build one full scene identity (e.g. proposed SCN-003) from the approved Atlas: intent -> page/journey -> wireflow -> composed scene -> actual editable UI -> tests and deployment/preview evidence. Derive SVG/icon/asset variants from approved masters through Assets Core where relevant. Preserve brand voice, non-default tenant storage, actual source lineage and meaningful responsive states.

**Tests:** actual CMS install/select -> edit -> save -> preview -> publish -> reopen across clean environment; reduced-motion, keyboard/mobile, assets from authoritative store; no production publish without approval.

**Exit:** A source-faithful, art-directed and genuinely functional vertical slice, not just another mockup.

## Q0 — Independent acceptance reviewer

**Scope:** tests, visual/behavioral review, source hash verification, packaging/portability. This agent does not supply self-approval for its own implementation.

**Brief:** Compare each job against its written acceptance and current source. Evaluate original art integrity, proof of execution, correct rights/identity, no fabricated outcomes, ability to use the tool as a customer, architecture reuse in an unrelated repo, responsive/reduced-motion behavior and correct release state.

**Exit:** A signed-off or rejected evidence report, linked to exact commits and reproducible test commands. Issues return to the owning agent; QA must not silently improve visual design by changing brand source.

## Standard handoff format

**Task ID / Owner / Base SHA / Branch**
**Sources consulted / Authority and approvals**
**Existing subsystem reused / No duplicate authority introduced**
**Changed paths and commits**
**Observed results / Gaps / Screenshots or preview**
**Tests run (exact commands and exit status)**
**Asset fingerprint / Receipt / Work item evidence**
**Rollback / Risks / Prerequisites for next task**
**Status: NOT STARTED | RESEARCHED | PROPOSED | IMPLEMENTED | VERIFIED | ACCEPTED | RELEASED**

Do not label a run VERIFIED because a package test passed if the specific requested interactive/customer journey remains untested.
