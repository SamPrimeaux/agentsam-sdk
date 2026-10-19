# AgentSam registry reference (generated)

> GENERATED FILE — DO NOT HAND EDIT. Run `node scripts/registry/generate-docs.mjs` to regenerate, or `node scripts/registry/generate-docs.mjs --check` to detect drift.

**Purpose:** source-backed documentation of existing machinery. This is an index of declarations and packaging, **not** proof of installation, handler readiness, provider permissions, or a shipped user journey.

## Registry summary

| Source authority | Count | Meaning |
| --- | ---: | --- |
| `src/cli/command-catalog.js` | 76 | Registered top-level CLI command entries |
| `protocol/capabilities/manifest.json` | 81 | Capability and agent-primitive declarations |
| `src/lib/setup/recipes.js` | 4 | Native prerequisite install recipes |
| `apps/*/agentsam.app.json and packages/*/agentsam.app.json` | 5 | APP manifests discoverable from this checkout |
| `packages/catalog/generated/packages.json` | 62 | Package inventory rows (not npm publication proof) |

Manifest status: 56 stable, 25 experimental, 14 explicitly non-deterministic. Host binding and approval remain separate.

## CLI command authority

| CLI root | Topic | Catalog summary |
| --- | --- | --- |
| `agentsam add` | create | Add an explicit feature/capability selection |
| `agentsam api-key` | start | Create/list/rotate AgentSam API keys (aak_*) |
| `agentsam app` | create | Bundled AgentSam apps launcher |
| `agentsam assist` | start | Choose software architecture using deterministic questions |
| `agentsam autorag` | work | AutoRAG configure/probe helpers |
| `agentsam billing` | runtime | Billing account relationships (not --billing-project) |
| `agentsam brand` | work | Deterministic brand intelligence |
| `agentsam cad` | work | CAD: cad.project.v1 tools (design_project_*/design_model_*), Blender/OpenSCAD/FreeCAD, OCCT native via design_model_build |
| `agentsam capabilities` | create | Inspect capability contracts |
| `agentsam cheat-sheet` | start | Organized command groups (gcloud-like) |
| `agentsam choose` | start | Choose an execution runtime from explicit goals |
| `agentsam cloudflare` | runtime | Wrangler reads + Worker CPU profiles |
| `agentsam codebaseindex` | work | Guided codebase ingest: materials, allowlist, embeddings, storage |
| `agentsam compute` | runtime | Alias for google-cloud compute/iam helpers |
| `agentsam connections` | runtime | Inspect execution connections |
| `agentsam context` | work | Git + bridge context from any repo |
| `agentsam create` | create | Scaffold a new AgentSam project from a preset |
| `agentsam credentials` | start | Audit credentials, drift, and failure remediation (never prints secrets) |
| `agentsam db` | runtime | Discover local and remote stores, inspect explicit remote D1 schemas, or manage local AgentSam SQLite |
| `agentsam deploy` | runtime | Graduate intentionally to cloud |
| `agentsam deploy-receipt` | runtime | Merkle deploy/checkpoint receipts |
| `agentsam dev` | work | Run this project’s npm dev script |
| `agentsam dockerize` | create | Build/run supported containers |
| `agentsam doctor` | start | Offline toolchain diagnosis with repair commands |
| `agentsam engine` | runtime | Discover, audit, benchmark, and govern local AI engines |
| `agentsam env` | start | Provider profile / shell loader helpers |
| `agentsam eval` | runtime | Context fixtures and live eval telemetry |
| `agentsam exec` | work | Run the existing AgentSam coding agent noninteractively with scoped permissions |
| `agentsam explain` | start | Explain a runtime or package from the offline catalog |
| `agentsam go` | runtime | Go product discover/build/deploy |
| `agentsam goap` | inside | GOAP blackboard status/plan |
| `agentsam google-cloud` | runtime | Google Cloud auth, projects, compute, IAM SAs, billing, doctor |
| `agentsam help` | start | Interactive or topic help from this catalog |
| `agentsam hooks` | runtime | Inspect lifecycle hooks, sources, and execution receipts |
| `agentsam identity` | create | Identity portal, providers, protocol surfaces |
| `agentsam index` | work | Plan/run incremental AST (+ optional embeddings) |
| `agentsam init` | create | Knowledge setup or local scaffold |
| `agentsam inspect` | work | Bounded repository inspect / authority view |
| `agentsam install` | create | Install an explicitly selected plugin |
| `agentsam login` | start | Sign in and persist machine-local session |
| `agentsam logout` | start | Sign out locally |
| `agentsam machine` | work | Machine inspection, evidence crawl, and read-only code reuse proposals |
| `agentsam mcp` | runtime | MCP server catalog and client adapters |
| `agentsam merch` | work | Preflight designs against portable manufacturing profiles |
| `agentsam merkle` | work | File integrity snapshots and explorer |
| `agentsam mini` | create | Create a small local gadget |
| `agentsam models` | start | Probe hosted/local model availability |
| `agentsam ollama` | runtime | Local Ollama setup/status/models |
| `agentsam package` | work | Audit, verify, and plan publication of distributable packages |
| `agentsam plan` | work | Durable project-local work plans + domain plans |
| `agentsam plugin` | create | Inspect and verify governed plugin products |
| `agentsam plugins` | create | Install and manage AgentSam plugins |
| `agentsam providers` | start | Configure machine provider credentials |
| `agentsam receipts` | runtime | Inspect receipt proofs and prune ephemeral AgentSam workdirs |
| `agentsam recon` | work | Bounded-worker packets + finding reports |
| `agentsam repo` | work | Repository snapshot / observations |
| `agentsam resume` | start | Resume a saved AgentSam session |
| `agentsam robotics` | work | SAM Robotics: robotics.scene.inspect/object.locate/grasp.plan/motion.plan/validate/simulate/execute/verify, robot.home, execution.cancel (model: never) |
| `agentsam run` | work | Inspect and control AgentSam runs across local or hosted control planes |
| `agentsam runtime` | runtime | Manage the local agentsamd runtime and daemon |
| `agentsam rust` | runtime | Rust/Wasm scaffold, doctor, check, build, dev, explicit deploy |
| `agentsam sam` | runtime | Inspect the SAM operations runtime, installed handlers and availability |
| `agentsam scaffold` | create | Generate CMS or worker-api starter |
| `agentsam search` | work | Retrieve indexed code/text |
| `agentsam security` | work | Dependency + trust-boundary scan |
| `agentsam setup` | start | Discover → plan → approve → install capabilities (Homebrew-style) |
| `agentsam shell` | inside | Interactive slash-command shell |
| `agentsam site` | work | Project-scoped site.scrape crawl and evidence |
| `agentsam skill` | start | Create, inspect, and install a specific skill |
| `agentsam skills` | create | List or load portable skill instructions |
| `agentsam start-local` | runtime | Local PTY WebSocket service |
| `agentsam status` | runtime | Account, models, terminal, and live deploy awareness |
| `agentsam terminal` | runtime | Manage terminal identity and enrollment, distinct from PTY sessions |
| `agentsam tunnel` | runtime | Cloudflare Tunnel via Wrangler |
| `agentsam update` | runtime | Component update preview (gcloud-like) |
| `agentsam whoami` | start | Authenticated account + tokenPermissions |

## Protocol capabilities and primitives

| ID | Domain | Kind | Status | Deterministic | Effect classification | CLI mapping |
| --- | --- | --- | --- | --- | --- | --- |
| `agentsam_cf_d1_list` | database | capability | stable | no | `network-read` | — |
| `agentsam_d1_create` | database | capability | stable | no | `external-write` | — |
| `agentsam_d1_delete` | database | capability | stable | no | `external-write` | — |
| `agentsam_d1_query` | database | capability | stable | no | `network-read` | — |
| `agentsam_d1_write` | database | capability | stable | no | `external-write` | — |
| `agentsam_sqlite_create` | database | capability | stable | yes | `filesystem-write` | — |
| `agentsam_sqlite_delete` | database | capability | stable | yes | `filesystem-write` | — |
| `agentsam_sqlite_edit` | database | capability | stable | yes | `filesystem-write` | — |
| `agentsam_sqlite_get` | database | capability | stable | yes | `none` | — |
| `agentsam_sqlite_list` | database | capability | stable | yes | `none` | — |
| `agentsam_sqlite_restore` | database | capability | stable | yes | `filesystem-write` | — |
| `blender.build` | cad | capability | experimental | no | `artifact-write` | `agentsam cad blender build <recipe.json> --out <model.blend> --json` |
| `blender.export` | cad | capability | experimental | no | `artifact-write` | `agentsam cad blender export <model.blend> --format <glb\\|stl\\|obj> --out <artifact> --json` |
| `blender.inspect` | cad | capability | experimental | yes | `none` | `agentsam cad blender inspect <model.blend> --json` |
| `blender.render_preview` | cad | capability | experimental | no | `artifact-write` | `agentsam cad blender render-preview <model.blend> --out <preview.png> --json` |
| `blender.status` | cad | capability | experimental | yes | `none` | `agentsam cad blender status --json` |
| `brand.plan` | brand | capability | stable | yes | `none` | `agentsam plan brand` |
| `brand.resolve` | brand | capability | stable | yes | `none` | `agentsam brand resolve` |
| `brand.scan` | brand | capability | stable | yes | `none` | `agentsam brand scan` |
| `capability.describe` | tool | capability | stable | yes | `none` | — |
| `capability.invoke` | tool | capability | stable | yes | `delegated-execution` | — |
| `capability.search` | tool | capability | stable | yes | `none` | — |
| `capability.status` | tool | capability | stable | yes | `none` | — |
| `cloudflare.cpu.audit` | cloudflare | agent_primitive | experimental | no | `none` | — |
| `cloudflare.cpu.profile` | cloudflare | capability | experimental | yes | `none` | `agentsam cloudflare cpu analyze <profile.cpuprofile>` |
| `cloudflare.d1.schema` | database | capability | stable | yes | `network-read` | — |
| `cloudflare.wrangler.native` | cloudflare | capability | experimental | no | `network-read` | `agentsam cloudflare run <command>` |
| `context.resolve` | agent | capability | experimental | yes | `none` | — |
| `deploy.receipt` | delivery | capability | stable | yes | `local-state` | `agentsam deploy-receipt capture` |
| `identity.init` | app | capability | stable | yes | `filesystem` | `agentsam identity init` |
| `knowledge.index` | repository | capability | stable | yes | `local-state` | `agentsam index run` |
| `knowledge.search` | repository | capability | stable | yes | `none` | `agentsam search "query"` |
| `machine.inspect` | repository | capability | stable | yes | `local-state` | — |
| `merkle.snapshot` | integrity | capability | stable | yes | `local-state` | `agentsam merkle snapshot` |
| `plan.create` | planning | capability | stable | yes | `local-state` | — |
| `plan.list` | planning | capability | stable | yes | `none` | — |
| `plan.next` | planning | capability | stable | yes | `none` | — |
| `plan.show` | planning | capability | stable | yes | `none` | — |
| `plan.status` | planning | capability | stable | yes | `local-state` | — |
| `plan.step.accept` | planning | capability | stable | yes | `local-state` | — |
| `plan.step.add` | planning | capability | stable | yes | `local-state` | — |
| `plan.step.depends` | planning | capability | stable | yes | `local-state` | — |
| `plan.step.evidence` | planning | capability | stable | yes | `local-state` | — |
| `plan.step.status` | planning | capability | stable | yes | `local-state` | — |
| `planning.goap` | planning | capability | stable | yes | `none` | — |
| `project.create` | repository | capability | stable | yes | `filesystem-write` | — |
| `project.delete` | repository | capability | stable | yes | `filesystem-write` | — |
| `project.discover` | repository | capability | stable | yes | `none` | — |
| `project.edit` | repository | capability | stable | yes | `filesystem-write` | — |
| `project.get` | repository | capability | stable | yes | `none` | — |
| `project.list` | repository | capability | stable | yes | `none` | — |
| `project.restore` | repository | capability | stable | yes | `filesystem-write` | — |
| `recon.pack` | agent | capability | stable | yes | `none` | `agentsam recon pack` |
| `repository.audit` | repository | agent_primitive | stable | no | `none` | — |
| `repository.crawl` | repository | capability | stable | yes | `local-state` | `agentsam machine crawl <path> --json` |
| `repository.intelligence` | repository | capability | stable | yes | `none` | `agentsam repo snapshot` |
| `repository.mine` | repository | capability | stable | yes | `local-state` | `agentsam machine mine <path> --against <path> --json` |
| `repository.snapshot` | repository | capability | stable | yes | `none` | `agentsam inspect --json` |
| `sam.evidence.begin` | evidence | capability | experimental | yes | `local_write` | — |
| `sam.evidence.capture` | evidence | capability | experimental | yes | `local_write` | — |
| `sam.evidence.compare` | evidence | capability | experimental | yes | `local_write` | — |
| `sam.evidence.deliver` | evidence | capability | experimental | yes | `local_write` | — |
| `sam.evidence.ingest` | evidence | capability | experimental | yes | `local_write` | — |
| `sam.evidence.seal` | evidence | capability | experimental | yes | `local_write` | — |
| `scaffold.create` | app | capability | stable | yes | `filesystem` | `agentsam create <name> --preset <preset>` |
| `security.scan` | security | capability | stable | yes | `network-optional` | `agentsam security scan` |
| `site.scrape` | web | capability | experimental | no | `network+filesystem;R2-only-with-explicit-authorization` | `agentsam site scrape` |
| `terminal.exec` | terminal | capability | experimental | no | `local-runtime` | — |
| `test.run` | tool | capability | stable | no | `filesystem-write` | — |
| `theme.storefront.shell` | theme | capability | experimental | yes | `none` | — |
| `tools.search` | agent | capability | experimental | yes | `none` | — |
| `workgraph.adapter.business` | workgraph | capability | experimental | yes | `none` | — |
| `workgraph.adapter.engineering` | workgraph | capability | experimental | yes | `none` | — |
| `workgraph.adapter.mcp` | workgraph | capability | experimental | yes | `none` | — |
| `workgraph.model` | workgraph | capability | experimental | yes | `none` | — |
| `workgraph.render.gantt_model` | workgraph | capability | experimental | yes | `none` | — |
| `workgraph.render.timeline` | workgraph | capability | experimental | yes | `none` | — |
| `workspace.list` | repository | capability | stable | yes | `none` | — |
| `workspace.read` | repository | capability | stable | yes | `none` | — |
| `workspace.search` | repository | capability | stable | yes | `none` | — |
| `workspace.write` | repository | capability | stable | yes | `filesystem-write` | — |

A `stable` declaration may still lack a resolved handler or permission in a particular host. Consult `capability.status` and the authorized host; `capability.invoke` is allowlisted, not a general-purpose CLI proxy.

## Native prerequisite recipes

| Recipe | Risk | Approval required | Provides | Platforms |
| --- | --- | --- | --- | --- |
| `cloudflare.wrangler` | low | yes | `cloudflare.wrangler` | `darwin`, `linux`, `win32` |
| `google.cloud` | medium | yes | `google.cloud.auth`, `google.cloud.doctor` | `darwin`, `linux`, `win32` |
| `image.raster.transform` | low | no | `image.raster.transform`, `image.raster.inspect` | `darwin`, `linux`, `win32` |
| `image.vectorize` | low | yes | `image.vectorize`, `image.optimize` | `darwin`, `linux`, `win32` |

Run `agentsam setup --list` for the current recipe catalog. `agentsam setup runtime` is a distinct GOAP/adapter placement lane; neither installs a third-party APP into Local Studio.

## APP definitions in the checkout

| APP ID | Manifest name | Package | CLI binary |
| --- | --- | --- | --- |
| `cad-creator` | AgentSam CAD Creator | `@inneranimalmedia/agentsam-cad-creator` | `bin/agentsam-cad-creator.mjs` |
| `client-cms-editor` | AgentSam Website + CMS Kit | `@inneranimalmedia/client-cms-editor` | `bin/agentsam-cms.js` |
| `database-editor` | AgentSam Database Editor | `@inneranimalmedia/agentsam-database-editor` | `bin/agentsam-database-editor.mjs` |
| `ecommerce-cms-agentsam` | AgentSam Ecommerce + CMS | `@inneranimalmedia/ecommerce-cms-agentsam` | `bin/ecommerce.mjs` |
| `local-studio` | AgentSam Local Studio | `@inneranimalmedia/agentsam-local-studio` | `bin/agentsam-studio.mjs` |

An APP definition is not a user-scoped installation. `agentsam app install <id>` currently prints distribution instructions; it does not persist an installed APP record or activate its runtime.

## Package inventory

| Package ID | npm name | Catalog status | Purpose |
| --- | --- | --- | --- |
| `agentsam-abs` | `@inneranimalmedia/agentsam-abs` | needs-review | AgentSam Auto Browser Shell: dual-mode Explore/Build browser surface with provider-agnostic generative navigation,… |
| `agentsam-analytics` | `@inneranimalmedia/agentsam-analytics` | needs-review | Portable AgentSam analytics read models and operational analytics surfaces. |
| `agentsam-assets-core` | `@inneranimalmedia/agentsam-assets-core` | needs-review | Shared Asset Core: canonical ast_* identity, machine facts, provenance, and provider representations. Peer BrandPa… |
| `agentsam-brand` | `@inneranimalmedia/agentsam-brand` | needs-review | Deterministic Brand Intelligence + portable brand-asset promotion SDK for AgentSam (inspect, derive, plan, promote… |
| `agentsam-browser-surface` | `@inneranimalmedia/agentsam-browser-surface` | needs-review | AgentSamBrowserSurface: a portable Browse/Build browser capability with a provider registry so the lightweight Loc… |
| `agentsam-campaign` | `@inneranimalmedia/agentsam-campaign` | needs-review | Portable AgentSam campaign intelligence for promotional planning, product launches, SEO/content strategy, merchand… |
| `agentsam-cloudflare-images` | `@inneranimalmedia/agentsam-cloudflare-images` | needs-review | Shared Cloudflare Images transport: credentials, delivery URLs, and HTTP client. Content and Brand consume this — … |
| `agentsam-cms` | `@inneranimalmedia/agentsam-cms` | classified | Portable executable SAM CMS machine with typed page/component tools, revision recovery, explicit publication, and … |
| `agentsam-connector-cloudflare` | `@inneranimalmedia/agentsam-connector-cloudflare` | needs-review | Portable Cloudflare capability connector for AgentSam applications and SDK consumers. Independent project; not aff… |
| `agentsam-content` | `@inneranimalmedia/agentsam-content` | needs-review | Portable content/library peer domain over Asset Core: lifecycle, usage, providers, intelligence, and createContent… |
| `agentsam-content-studio` | `@inneranimalmedia/agentsam-content-studio` | needs-review | Canonical React UI for AgentSam Content Studio: library, inspectors, assistant rail. Host apps provide a ContentRu… |
| `agentsam-contracts` | `@inneranimalmedia/agentsam-contracts` | needs-review | Framework-neutral AgentSam contracts for workbench, tools, providers, events, hooks, execution, identity and repos… |
| `agentsam-database-editor` | `@inneranimalmedia/agentsam-database-editor` | needs-review | Portable AgentSam Database Editor — adapters for SQLite/D1/Postgres/Supabase + vectors surface. Donor: IAM /dashbo… |
| `agentsam-desktop-shell` | `@inneranimalmedia/agentsam-desktop-shell` | needs-review | Tauri desktop application and downloadable AgentSam Local Studio .app/.dmg packaging, including native bridges, bu… |
| `agentsam-docs-theme` | `@inneranimalmedia/agentsam-docs-theme` | needs-review | Violet docs skin tokens for AgentSam public guides (Systematic Autonomous Machinery). |
| `agentsam-errors` | `@inneranimalmedia/agentsam-errors` | needs-review | Canonical AgentSam runtime error normalization, classification, transport, remediation and rendering. |
| `agentsam-goap` | `@inneranimalmedia/agentsam-goap` | needs-review | Portable AgentSam GOAP control-plane contracts and adapters over existing blackboard, ticket, workflow, execution,… |
| `agentsam-hooks` | `@inneranimalmedia/agentsam-hooks` | needs-review | Provider-neutral, language-agnostic AgentSam lifecycle hooks with callback, command, HTTP, model, tool, MCP, LSP, … |
| `agentsam-ide` | `@inneranimalmedia/agentsam-ide` | needs-review | AgentSam IDE packages — Monaco, file tree, xterm, LSP client, first-login onboarding. Rapidly deployable into Loca… |
| `agentsam-identity` | `@inneranimalmedia/agentsam-identity` | needs-review | Identity module for @inneranimalmedia/agentsam-sdk (workspace — publish via root SDK) |
| `agentsam-key-manager` | `@inneranimalmedia/agentsam-key-manager` | needs-review | AgentSam settings UI for keys + integrations. Uses agentsam-vault contracts; Kumo-style SensitiveInput primitives. |
| `agentsam-knowledge` | `@inneranimalmedia/agentsam-knowledge` | needs-review | Portable AutoRAG discovery, adapter registries, probes, and company routing contracts for AgentSam. |
| `agentsam-loading-scene` | `@inneranimalmedia/agentsam-loading-scene` | needs-review | Provider-agnostic runtime visualization with six seamless full-frame Computational Hyperspace studies driven by re… |
| `agentsam-local-shared` | `@inneranimalmedia/agentsam-local-shared` | needs-review | Private shared Local Studio chat, vault, inventory and workspace contracts. |
| `agentsam-merch` | `@inneranimalmedia/agentsam-merch` | needs-review | Provider-neutral manufacturing profiles, preflight, derivative planning, and collection-lab primitives for AgentSa… |
| `agentsam-nav` | `@inneranimalmedia/agentsam-nav` | needs-review | Reusable responsive navigation primitives for AgentSam dashboard-family applications. |
| `agentsam-queue-control` | `@inneranimalmedia/agentsam-queue-control` | needs-review | Portable AgentSam queue, job-routing, retry, scheduling, and execution-control primitives with provider adapters. |
| `agentsam-rapid-rust` | `agentsam-rapid-rust` | needs-review | AgentSam native scaffolder and lifecycle CLI for Cloudflare Rust/Wasm Workers |
| `agentsam-repository` | `@inneranimalmedia/agentsam-repository` | needs-review | Portable AgentSam repository identity, Merkle, semantic file metadata, persistence, and repository graph runtime c… |
| `agentsam-scoring` | `@inneranimalmedia/agentsam-scoring` | needs-review | Generic ScoreCard contract and versioned weight formulas. Raw evidence is SSOT; scores are recomputable derived vi… |
| `agentsam-sections` | `@inneranimalmedia/agentsam-sections` | needs-review | Reusable mxs-* page kit: global header/footer, scroll-driven split sections, and a media slot for image, gif, vide… |
| `agentsam-settings` | `@inneranimalmedia/agentsam-settings` | needs-review | Portable AgentSam Settings shell, contracts, fixtures, and host adapter surface for desktop and hosted application… |
| `agentsam-shell-kit` | `@inneranimalmedia/agentsam-shell-kit` | needs-review | Compatibility facade for the AgentSam workbench shell. New code uses @inneranimalmedia/agentsam-workbench. |
| `agentsam-vault` | `@inneranimalmedia/agentsam-vault` | needs-review | AgentSam credential vault core — contracts, AES-GCM crypto, provider registry, resolver. UI lives in agentsam-key-… |
| `agentsam-work` | `@inneranimalmedia/agentsam-work` | needs-review | Portable AgentSam Work product surface: shared work contracts, fixture and HTTP hosts, project/ticket/mail/calenda… |
| `agentsam-work-graph` | `@inneranimalmedia/agentsam-work-graph` | needs-review | Core AgentSam work-graph primitive: one graph model (WorkItem, Dependency, TimelineEvent, Artifact, Evidence, Acto… |
| `agentsam-workbench` | `@inneranimalmedia/agentsam-workbench` | needs-review | Reusable AgentSam workbench primitives for agent threads, composer, browser, terminal and resizable work surfaces. |
| `analytics-ui` | `@inneranimalmedia/analytics-ui` | needs-review | Domain-neutral analytics presentation primitives for Inner Animal Media products. |
| `cms-runtime` | `@inneranimalmedia/cms-runtime` | needs-review | Portable self-describing local CMS runtime with SQLite schema, tool/skill catalogs, and provider-neutral package c… |
| `copro-editor` | `@inneranimalmedia/copro-editor` | needs-review | Deterministic headless CoPro edit command engine with undo and redo. |
| `copro-media` | `@inneranimalmedia/copro-media` | needs-review | Provider-neutral CoPro media asset identity, provenance, and repository contracts. |
| `copro-project` | `@inneranimalmedia/copro-project` | needs-review | Provider-neutral CoPro project document, serialization, validation, and migration contracts. |
| `copro-proof` | `@inneranimalmedia/copro-proof` | needs-review | Mechanical vertical proof that CoPro project, media, editor, timeline, render, templates, and provider contracts c… |
| `copro-provider-contracts` | `@inneranimalmedia/copro-provider-contracts` | needs-review | Provider-neutral CoPro capability contracts for media, generation, transcription, embeddings, conversion, and rend… |
| `copro-render` | `@inneranimalmedia/copro-render` | needs-review | CoPro render planning and renderer capability selection without renderer leakage into project files. |
| `copro-storage` | `@inneranimalmedia/copro-storage` | needs-review | Portable CoPro project persistence adapters for memory and browser local storage. |
| `copro-templates` | `@inneranimalmedia/copro-templates` | needs-review | Structured CoPro creative template contracts for canvas, slots, track skeletons, captions, transitions, audio cues… |
| `copro-timeline` | `@inneranimalmedia/copro-timeline` | needs-review | Headless CoPro timeline projection, ordering, duration, and viewport math. |
| `copro-ui` | `@inneranimalmedia/copro-ui` | needs-review | Mobile-first creator UI for CoPro with preview, timeline, direct manipulation, edit tools, media tray, transport, … |
| `fnf-theme` | `@inneranimalmedia/fnf-theme` | needs-review | Brand-specific FNF theme renderer consuming portable ThemePreview registry |
| `theme-contract` | `@inneranimalmedia/theme-contract` | needs-review | Portable provider-neutral theme preview registry and composition contracts |
| `theme-cypress` | `@inneranimalmedia/theme-cypress` | needs-review | A welcoming community prebuild for organizations that need events, groups, giving, visits, and mission-driven stor… |
| `theme-ember` | `@inneranimalmedia/theme-ember` | needs-review | An editorial commerce prebuild that mixes product discovery, brand story, collections, community, and launch momen… |
| `theme-forge` | `@inneranimalmedia/theme-forge` | needs-review | A mobile-first local-services prebuild with estimate capture, service-area confidence, project proof, reviews, and… |
| `theme-grove` | `@inneranimalmedia/theme-grove` | needs-review | A visual service-business prebuild centered on project galleries, material detail, process, reviews, and estimate … |
| `theme-harbor` | `@inneranimalmedia/theme-harbor` | needs-review | A professional-services prebuild for trust-heavy businesses: clear service storytelling, proof, resources, and lea… |
| `theme-heuristic` | `@inneranimalmedia/theme-heuristic` | needs-review | Stock AgentSam CMS storefront shell theme contract (heuristic-theme). |
| `theme-iasf` | `@inneranimalmedia/theme-iasf` | needs-review | IASF — stock Inner Animal Storefront theme pack (normalized from studio-cms-editor harvest). |
| `theme-resolve` | `@inneranimalmedia/theme-resolve` | needs-review | A high-fashion commerce prebuild built around cinematic scroll, shoppable editorial, sticky purchase rails, lookbo… |
| `theme-scenes` | `@inneranimalmedia/theme-scenes` | needs-review | Reusable scene / shell / block vocabulary for branded website experiences. BrandPack owns look; theme-scenes owns … |
| `theme-summit` | `@inneranimalmedia/theme-summit` | needs-review | A restrained consulting and portfolio prebuild with editorial services, case studies, multilingual-ready structure… |
| `theme-violet` | `@inneranimalmedia/theme-violet` | needs-review | A campaign-forward prebuild with bold calls to action, impact proof, stories, donation moments, and participation … |

Packages may be public distributions, shared implementation, local application dependencies, or infrastructure. Directory placement alone does not define the intent or distribution status. The package catalog is a projection, not platform `agentsam_products` or install-state authority.

## Ownership and verification

- Setup: [capability install planner](../contracts/capability-install-planner.md)
- Workflow entrypoints: [CLI workflows](AGENTSAM-CLI-WORKFLOWS.md)
- Portable apps: [application contract](../architecture/AGENTSAM_APPLICATION_CONTRACT.md)
- Product taxonomy: [portfolio ADR](../adr/ADR-0003-product-portfolio-and-package-taxonomy.md)
- Account and machine credentials: [environment vocabulary](../contracts/environment-vocabulary.md)
- Release readiness: [delivery closure](../standards/DELIVERY_CLOSURE.md)
