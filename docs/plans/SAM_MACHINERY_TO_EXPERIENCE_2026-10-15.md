# SAM machinery to authored experiences — coordinated agent workflow

**Status:** PROPOSED execution program, not shipped functionality or founder-approved public copy
**Prepared:** 2026-10-15 · **Starting SDK baseline:** main at 803b5839 · **Owner:** SDK integration lead; brand approval stays with the project owner
**Purpose:** Make existing Systematic Autonomous Machinery dependable before mining creative archives or presenting an unfinished visual demonstration as a complete customer experience.

## Mandate and authority

AgentSam is not a generic web-development agency generator. It is a portable product for discovering, coordinating and verifying capabilities. SAM is the deterministic execution and evidence system below it. The LLM proposes interpretations and creative directions; it does not replace runtime truth, brand ownership, storage contracts or observed evidence.

Follow AGENTSAM.md, .agentsamrules, docs/architecture/SAM_KERNEL.md, and existing package contracts. For brand-specific work, load the consuming project's founder-controlled brand guide and decision register. This program is **not** a replacement for that guide. InnerAnimalMedia is a reference acceptance project, never an SDK product seed, default tenant, provider configuration or package identity.

**Order of operations:** establish execution authority -> retain portable repository knowledge -> connect durable planning -> inventory genuine creative sources -> develop approved experience -> implement through existing products -> verify the result.

## Non-negotiable constraints

1. **Preserve before refining.** Originals, animations, existing interactive scenes, 3D sources, approved copy, historical experiments and source archives are immutable during inventory. Record checksums and source paths; produce explicitly named derivatives. No deletion, replacement or silent reskin.
2. **One owner per authority.** Use existing SAM kernel, Repository/Machine, Knowledge/AutoRAG, GOAP/A*, Plan ledger, Work Graph, Brand, Assets Core, Content, Campaign, CMS/theme sections and CoPro. Do not add a rival registry, task ledger, D1 table family, CMS runtime or generic planning package without a demonstrated missing contract and owner approval.
3. **Portable first.** No operator paths, IAM account identifiers, Cloudflare defaults, founder artwork, tenant logos or credentials in reusable packages. Host-injected resource-scoped adapters for local filesystem, remote storage, execution and OAuth. Never fall back from missing user authority to platform-owner resources.
4. **Observed != proposed != approved != deployed.** Every artifact reports authority and evidence. A successful test is not a successful experience; a screenshot is not a live implementation; a functioning preview is not proof of CMS install/edit/save/publish.
5. **One change, one accountable branch.** Use dedicated worktrees and PRs. Do not clean other agents' worktrees, merge draft PRs, or modify shared contract surfaces from multiple lanes simultaneously.
6. **Creative leadership isn't a vanity metric.** Do not score aesthetic approval from token counts, churn, mock popularity or a numerical originality heuristic. Founder/authorized reviewer selects the direction; automated tests verify behavior and integrity.
7. **No unapproved product writes.** Research, inventory, test fixtures and isolated proposals are permitted under repo policy. Source mutation, publishing, infrastructure migration and runtime write operations require their applicable authorization.
8. **Don't confuse models and methods.** Deterministic SAM observes/validates/executes; AI interpretation and specialist critique assist. Specialism does not automatically create a new npm package.

## Dependency graph and dispatch gates

~~~text
S0 SOURCE + CONTRACT BASELINE
    |                            \
    v                             v
S1 SAM KERNEL + CLIENT        S2 REPOSITORY + KNOWLEDGE WARM START
    |                             |
    +-------------+---------------+
                  v
S3 GOAP / PLAN / WORK / RECEIPTS: END-TO-END VERTICAL SLICE
                  |
                  v
S4 BRAND EVIDENCE + FOUNDER REVIEW (not token consolidation)
                  |
          +-------+-------+
          v               v
S5A ORIGINAL ASSET     S5B SCENE / UX / MOTION
     PRODUCTION             PRODUCTION
          +-------+-------+
                  v
S6 CMS / STUDIO INTEGRATION + CAMPAIGN / CONTENT
                  |
                  v
S7 CROSS-REPO, CROSS-HOST, CLIENT-EXPERIENCE ACCEPTANCE
~~~

Only S0 is free of implementation dependencies. S1 and S2 can run concurrently when they don't change the same schema or execution contract. S5A/S5B can run concurrently only after an explicit brand/experience decision. A sprint does not graduate because an agent says it did.

## S0 — Canonical recon, safety and baseline (read-only)

**Lead:** integration + QA. **Outputs:** current SHA/worktree list; package/operation ownership map; executable-vs-declared capability inventory; baseline timings and tests; protected-source manifest; prioritized defects; reusable fixture project.

- Check active branches, outstanding PRs, untracked assets and existing intent before adding code.
- Inspect SAM OS/client, manifest/protocol, registry, model-facing adapters, current Run/Work authority, installed CLI artifact, local/remote execution lanes and existing knowledge generations.
- Inspect original source integrity separately from deployed copy and derivative preview.
- Establish three test scenarios: a fresh unfamiliar repo, a multi-worktree/80-repo catalog scenario, and a real client brand/experience scenario.
- Record incomplete/unavailable integrations explicitly. The previous kernel audit on eb804e08 identified incorrect default root resolution, absent core schema enforcement, inaccurate execution receipts, non-atomic installation and registry/projection drift; reverify on the current SHA rather than treating this list as timeless.

**Gate G0:** reproducible baseline, protected originals, no unknown authority and a bounded task/owner map. No production writes.

## S1 — SAM kernel and AgentSamClient execution integrity

**Owner:** src/sam and existing contracts. **Deliver:** isolated instance-based SAM OS, canonical operation ID, transactional versioned bindings, trusted scoped execution context, validation/policy prior to dispatch, truthful driver-produced receipts, consistent readiness and adapter projections. Preserve supported public AgentSamClient calls through compatibility.

- Fix configured-repository vs process.cwd resolution.
- Validate bound operations and requested/available lane, rather than assuming local.
- Require host-granted policy for privileged effects; allow explicit offline read-only policy without forced account login.
- Use existing packages/agentsam-contracts and protocol/sam definitions, not a fourth schema family.
- Reconcile SDK manifest, SAM operation cards, host tool schema discovery and generated candidates: declared is not executable.
- Test atomic install/rollback, denial, invalid input/output, timeouts, cancellation, true usage metadata, and multi-tenant scope.

**Gate G1:** negative tests reliably deny; all core registrations hydrate valid schemas; CLI and model adapters agree; existing functional handlers still pass.

## S2 — Efficient 80+ repository intelligence

**Owner:** agentsam-repository, native/agentsam-machine, existing Knowledge engine. **Deliver:** stable repo/worktree identity, content-hashed source graph, optional incremental local AST/lexical index, scoped Git historian, bounded recall packets and honest freshness.

- First resolve repo/ref/checkout/tracked state and check a previous generation.
- Reuse unchanged file hashes; re-evaluate changed files and affected graph neighbors.
- Prefer Machine/Repository/Knowledge local evidence before model spend or remote Vectorize.
- Do not confuse local repository intelligence with a hosted index being missing. Remote providers are additive and explicitly selected.
- Catalog across repos by capabilities/ownership and reference existing per-repo indexes; do not make one monolithic copied code DB.
- Preserve source path, commit/dirty evidence, schema, timestamp, source kind and confidence. Never promote a hotspot score to proof of architecture.

**Gate G2:** second chat resolves a previously indexed capability without full rediscovery; stale results identified; fresh unrelated repo works without cloud credentials; retrieval budgets and timing measured.

## S3 — Planning-to-execution closure

**Owner:** agentsam-goap, existing Plan ledger/Work Graph and SAM runtime. **Deliver:** one real plan, goal, selected operation, approval, execution, receipt, verification and recovery trail.

- A* remains a solver; GOAP models feasible actions; Plan owns durable intent; Work Graph is a view/dependency projection; SAM invokes approved operations; Superbash handles approved general scripts when specialized operations cannot.
- Map packaged GOAP facts to the existing solver through a **tested** adapter; do not reimplement A* or create separate GOAP tables.
- Persist task dependencies, expected effects and acceptance evidence; verify effects before marking completion.
- Long-running execution must resume safely after disconnection and report uncertainty rather than blindly retrying external writes.

**Gate G3:** restart a mid-flight task, recover its state, inspect events, approve when required, verify the real effect and never duplicate uncertain writes.

## S4 — Meaningful brand research and creative direction

**Owner:** agentsam-brand + agentsam-assets-core, consuming project's brand authority. **Deliver:** classified source archive, creative evidence map, reviewed direction, BrandContract decisions and Experience Atlas references.

- Distinguish observed colors/fonts/assets, historical inspirations, experimental concepts, live usage and founder-approved identity. Counts alone cannot approve identity.
- Develop positioning, narrative, visitor needs, five-stage atlas (brand/experience map; sitemap/flows; wireframes; UI/prototype; design-to-development proof).
- Creative specialist workflows (strategist/researcher/art director/UX writer/motion director) are reusable skill/configured roles, not automatically new packages.
- Brand owns the approved language/identity; Campaign plans communication; Content manages actual material; editors/CoPro/CMS own their respective mutable representations.

**Gate G4:** an authorized reviewer can trace each approved decision to evidence and reject proposals without corrupting previous versions.

## S5A/S5B — Original art and functional experience

**S5A owner:** BrandPack, Assets Core, appropriate CAD/SVG/CoPro tools. **Deliver:** protected original masters, approved derivatives, SVG icon family, working favicon/app-icon bundles, image/3D provenance and export tests.

**S5B owner:** site experience + scene/CMS owner. **Deliver:** real working responsive scroll choreography, meaningful transitions, keyboard and touch behavior, reduced motion and composable scene contracts tied to the approved narrative.

- Mine existing assets only against a defined scene or visual problem; audit material quality and source rights, do not create a giant catalog of decorative effects.
- Use original interactive sources as source, not flattened screenshots or generative lookalikes.
- Validate WebGL lifecycle, pause/offscreen behavior, viewport sizing, hierarchy/contrast and performance on actual devices.
- Do not hardcode consuming brand names/tokens/scenes into a reusable renderer.

**Gate G5:** beautiful **and** functional: actual interaction recordings, source-level contracts and visual review, with original checksums intact.

## S6 — Actual ownership and delivery

**Owner:** existing CMS, Content Studio, Campaign and Work surfaces. **Deliver:** install/select, edit, save draft, preview, publish and reopen a project without local-build fragility or invented outcomes.

- Assets are resolved through configured authoritative storage, not a developer laptop's surviving files.
- A story-led case study can display research/design intent alongside actual product demo; distinguish proofs from concepts.
- Avoid a new standalone brand editor if Content Studio/CMS capabilities can be completed through their real owners.
- Campaigns consume approved narrative/assets and actual metrics, never substitute fictional performance claims.

**Gate G6:** independent app user can edit a section/media element, persist it, republish, reopen on another device, and identify source/receipt.

## S7 — Release certification and measured outcome

**Owners:** QA + integration. **Deliver:** SDK packaged install, unrelated repo and alternate storage adapter tests, same operation IDs/schemas/receipts across CLI/desktop/MCP, responsive experience acceptance, PR and release evidence.

- Compare cold/warm boot time, index reuse, context tokens, provider calls, repeat discovery, interaction correctness, accessibility, render budgets and verified goal completion.
- Reviewer must experience the finished work, not only read test logs.
- PRs are accepted separately; do not deploy/publicize until quality, security and operational checks pass.

**Gate G7:** another organization's brand and repo can run the same machinery without adopting InnerAnimalMedia's identity, assets, Cloudflare account or appearance.

## Swarm assignment protocol

Each agent receives: **task ID, bounded package/file ownership, base SHA, source authority, prerequisites, exact behavior change, forbidden scope, evidence required, verification command, rollback route, output branch/PR, and definition of done**.

- **Integration lead:** assigns exclusive contract ownership, adjudicates cross-package dependencies, validates before merge. Does not invent creative direction.
- **Kernel lane:** S1 only; no UI remodeling.
- **Knowledge lane:** S2 only; no new index/database unless existing contract demonstrably cannot serve.
- **Plan/GOAP lane:** S3 only; preserves ledger authority.
- **Creative lane:** S4 research/proposals, then S5 after explicit direction; no rewriting original assets.
- **Site/product lane:** S5B/S6 actual host editing and presentation; no speculative CMS table family.
- **Independent QA:** negative tests, source checksums, accessibility, multi-host smoke tests, failure evidence.
- No two code-writing agents modify the same owner files in parallel. Parallel research is welcome; concurrent contract mutations are not.

## Handoff artifact from every agent

Record: start/end commit SHA; package/operation IDs; current branch/worktree; decision authority; files modified; tests and exact results; source/asset hashes where relevant; changed behavior demonstrated; screenshots/video or runnable preview; known gaps; risks; rollback/compatibility; proposed next task; explicit ready/block status.

**Status words:** NOT STARTED, RESEARCHED, PROPOSED, IMPLEMENTED, VERIFIED, ACCEPTED, RELEASED. These are not interchangeable. A check passing does not advance status to ACCEPTED without its authorized decision or to RELEASED without release evidence.

## Reference acceptance case

See docs/reference/INNERANIMALMEDIA_EXPERIENCE_ACCEPTANCE_2026-10-15.md. It is a *specific test client and founder-origin narrative*, not a product requirement that all AgentSam users share its identity. The project's own founder guide, decision register and actual work-scene original outrank any description in this sprint plan.

**First dispatch:** S0 read-only ownership/integrity packets + S1 root/schema/policy tests + S2 cached source retrieval investigation. Defer new art production, component galleries and public website redesign until their prerequisites are accepted.
