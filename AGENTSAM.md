# AgentSam Runtime Contract

This file defines stable behavior for AgentSam agents using the portable SDK. It is not account state, project state, a run log, or a replacement for repository-specific `.agentsamrules`.

**Naming:** AgentSam is the product. **SAM** means **Systematic Autonomous Machinery** — the typed
operation/execution spine (`sam.invoke`, modules, receipts). In docs and code, `sam` is the
conventional client variable for that machinery, never a human identity. Prefer “SAM resolves…” /
“AgentSam executes through SAM…” over anthropomorphic phrasing. Architecture SSOT:
`docs/architecture/SAM_KERNEL.md`.

## AgentSam system model: deterministic machinery + LLM augmentation

AgentSam is deliberately **not** “an LLM with tools.” It is a layered system:

- **Old-school AgentSam / SAM** owns deterministic perception and execution: repository discovery, manifests, Git/Merkle evidence, AST/indexes, capability probes, provider/runtime discovery, schemas/migrations, routing constraints, typed operations, receipts, and verification.
- **LLM AgentSam** augments that machinery where language-model reasoning is valuable: interpreting intent, resolving ambiguity, planning across valid options, composing/translating content or code, explaining evidence, and proposing transformations.
- Deterministic evidence is authoritative when it can answer a question reliably. Do not ask an LLM to rediscover or guess facts that SAM can inspect, derive, or prove.
- LLM output never overrides authorization, runtime capability evidence, manifests, migrations, provider state, product contracts, or verification receipts.
- Core product workflows should remain inspectable and recoverable without hidden model reasoning. Emit typed/versioned receipts and explicit state transitions instead of treating a transcript as system state.
- A model may recommend an action; trusted machinery decides whether the action is available, authorized, correctly scoped, and verifiably complete.

This division is a product requirement: **LLMs supercharge AgentSam; they do not become the source of truth that holds AgentSam together.**

## Portability, resale, and repurposability law

AgentSam machinery is only reusable when an unrelated user can install or instantiate it without inheriting the operator's machine, identity, credentials, infrastructure, or monorepo.

- A reusable package, app, template, or pipeline must not require Sam/operator-specific usernames, device names, absolute paths, domains, account IDs, database IDs, repository names, credentials, customer content, or private infrastructure assumptions.
- Customer differences belong primarily in manifests, portable schema/data, company/brand rows, themes, provider grants, capability configuration, and content — **not source-code forks**.
- Product apps under `apps/` are independently extractable. Advertised CLI/app capabilities must work from the published/packed artifact outside this monorepo; repo-local `file:` escape dependencies are not a valid release mechanism.
- If the SDK advertises a datastore, provider, runtime, or backend as supported, the corresponding contract and implementation must ship together. Do not mark placeholders or “follow-up” adapters as supported production paths.
- Generic packages stay generic. Product/customer seeds, deployment bindings, brand values, and app-specific migrations belong with the consuming app or installation.
- Authorization and resource visibility are always principal/installation scoped. **No authorized resource must never fall back to a platform-owner resource.**
- Product readiness is proven, not asserted. Use current manifests, machine inspection, clean-room packaging/install tests, migrations, doctors, and receipts. If a product cannot pass its declared contract, mark it non-graduated/unavailable rather than advertising readiness.
- Extend existing authorities and adapters instead of creating parallel copies of Identity, Database Studio, Settings, themes, registries, or runtime state.

Product graduation and resale enforcement are defined in
[`docs/PRODUCT_LIFECYCLE.md`](docs/PRODUCT_LIFECYCLE.md).

## Execution

- Infer routine implementation details when repository evidence makes the answer clear; do not block on unnecessary questions.
- Carry authorized work through the coherent implementation, verification, and reviewable result instead of stopping at an audit or TODO list.
- Never claim a command, test, build, commit, merge, publish, or deploy succeeded without execution evidence.
- Runtime authentication and authorization are authoritative. Never ask the model to invent account, repository, connection, run, or task identifiers already owned by the runtime.

## Context discipline

- Use the smallest context that contains the evidence required for the task.
- Retrieve deliberately: structural metadata and compact cards first, then excerpts/ranges, then full objects only when required.
- Treat a model context window as a technical ceiling, not a target working-set size.
- Respect model-specific working-set policy and pricing boundaries before a request is sent. Compact proactively rather than paying for an avoidable threshold crossing.
- Preserve stable references and hashes when evidence leaves active context so it can be rehydrated explicitly.
- Keep observability and telemetry out of model context unless a task explicitly requires a bounded excerpt of it as evidence.

## Tool discipline

- Search compact capability cards before hydrating schemas when the tool surface is large.
- Hydrate only the selected tool schemas needed for the current step.
- Prefer deterministic code, Git, Merkle, AST, indexes, and other non-LLM mechanisms when they can answer the question reliably.
- Keep security- or correctness-critical checks in trusted runtime code, not prompt prose.

## Repository behavior

- Inspect relevant current code before changing it.
- Extend working primitives instead of creating parallel legacy implementations.
- Git owns source-control history. Merkle owns filesystem evidence and snapshot lineage. Runtime/hosted stores own run and execution history.
- Portable project configuration must not become an account/session/run database.

## Storage architecture law

- Ordinary AgentSam operation is local first. Its own ProjectSession, runs,
  receipts, and resumability use the project-owned
  `.agentsam/data/agentsam.sqlite` and versioned `migrations/runtime/` by
  default. The project root, rather than a moving shell cwd or model choice,
  determines that database.
- Durable Objects are **not** part of the default AgentSam SDK runtime or
  execution path. A product may opt into an actor adapter only for a proven
  distributed actor requirement; ordinary sessions, plans, tools, terminals,
  and task state must not acquire a hidden Durable Object dependency.
- A project's application data keeps its existing authority. This repository's
  live Local Studio Worker uses its real D1, Hyperdrive, R2, AI, and service
  bindings for the purposes they already serve. AgentSam's local session
  SQLite does not replace those bindings or silently sync to them. A user may
  explicitly choose connected infrastructure where it fits the required data.
  For application features, inspect and prefer the user's real project storage;
  use local SQLite for application data when selected or clearly beneficial.
- Persist only state that supports continuity, recovery, meaningful receipts,
  or valuable caches. Give new state a persistent, session, work_cycle, ttl,
  or scratch lifecycle; expire disposable planner/search state. Do not persist
  hidden reasoning, unlimited transcripts, or credential values in generic
  runtime state.
- Provider-returned compacted continuation windows are session-scoped protocol
  state, stored separately from generic session JSON in the project SQLite.
  Preserve their exact output until successful continuation replaces it; never
  promote them into knowledge or interpret encrypted provider content.
- Blackboard state describes the current work cycle; knowledge describes reusable
  understanding; evidence supports either. Provider continuation is a separate
  inference artifact. None substitutes for the other authorities.
- Keep runtime relational persistence behind the existing SQLite runtime and
  migration path. Object/blob, vector, and optional actor semantics remain
  separate capabilities. Declare storage capabilities truthfully; do not
  pretend SQLite provides distributed actor behavior.

See [Storage architecture](docs/architecture/STORAGE.md) for enforcement and
the current compatibility boundary.

## Application contract (APP identity)

Portable product apps follow [`docs/architecture/AGENTSAM_APPLICATION_CONTRACT.md`](docs/architecture/AGENTSAM_APPLICATION_CONTRACT.md).

- **APP** = installable product (`agentsam.app.json`, immutable kebab-case `APP.id`).
- **Not** an APP merely because it is under `apps/`, deployable, or an npm package.
- Runtime identity: `import APP from "./agentsam.app.json"` — never `const APP = "agentsam-…"`.
- `.agentsam/app.json` is host/install state (`app_id`), not a second product definition.
- Package, Worker, route, desktop, and service names are separate namespaces with explicit pointers.
- Gate: `agentsam app validate` / `npm run guard:apps`.

## Model and run policy

- Model, reasoning effort, service tier, budget, and permissions are runtime configuration, not hidden prompt instructions.
- Show users meaningful cost/latency controls when the active provider/model supports them; do not silently guess support.
- Batch is an asynchronous execution lane, not an interactive service tier. Projected spend and request counts must be known before submitting budgeted background work.
- Do not impose arbitrary short wall-clock caps on legitimate long work. Use checkpoints, progress events, durable receipts, provider status, and explicit fallback policy so a slow run can continue or fail visibly rather than being silently abandoned.

## Product verification evidence law

Any new product-verification feature must first consume existing Machine, Repository, capability, Settings, Identity, Vault, hooks/MCP, and package evidence. It may add a missing evidence adapter, but it must not rescan or reimplement an authority that already produces the required fact.

Every product finding must identify:
- the evidence source that supports it, and
- the expected canonical owner when the finding is about duplicated or misplaced authority.

A warning that only says "duplicate code" is incomplete. Product inspection is perception only; it must not mutate source, connect accounts, grant permissions, execute tools, or manufacture runtime proof. Product readiness is computed from current verification evidence and must never be stored as a casually writable `ready` flag.

## Verification and completion

- Run proportionate focused tests first, then the repository gates required by the affected public surface.
- Preserve provider-reported usage alongside local estimates and treat provider usage as authoritative when available.
- A task is complete only when its code/contracts/docs/tests agree and the final status is supported by evidence.

## Instruction precedence

AgentSam compiles instructions deterministically in this order:

1. `AGENTSAM.md` — stable runtime behavior (this file).
2. `.agentsamrules` — repository-specific rules, loaded after the stable contract and therefore more specific where the two address the same repository behavior.

Compatibility adapters for other coding agents (`AGENTS.md` for Cursor/Codex,
`CLAUDE.md` for Claude Code) must only redirect here. They must not duplicate
AgentSam policy. If a shim and this file conflict, this file is authoritative.
Nested app-level `AGENTS.md` files under `apps/` are app-specific contracts,
not substitutes for this runtime file.

Live account, authorization, model, run, task, terminal, and usage state never belong in either file.
