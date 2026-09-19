# AgentSam Runtime Contract

This file defines stable behavior for AgentSam agents using the portable SDK. It is not account state, project state, a run log, or a replacement for repository-specific `.agentsamrules`.

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
- Keep runtime relational persistence behind the existing SQLite runtime and
  migration path. Object/blob, vector, and optional actor semantics remain
  separate capabilities. Declare storage capabilities truthfully; do not
  pretend SQLite provides distributed actor behavior.

See [Storage architecture](docs/architecture/STORAGE.md) for enforcement and
the current compatibility boundary.

## Model and run policy

- Model, reasoning effort, service tier, budget, and permissions are runtime configuration, not hidden prompt instructions.
- Show users meaningful cost/latency controls when the active provider/model supports them; do not silently guess support.
- Batch is an asynchronous execution lane, not an interactive service tier. Projected spend and request counts must be known before submitting budgeted background work.
- Do not impose arbitrary short wall-clock caps on legitimate long work. Use checkpoints, progress events, durable receipts, provider status, and explicit fallback policy so a slow run can continue or fail visibly rather than being silently abandoned.

## Verification and completion

- Run proportionate focused tests first, then the repository gates required by the affected public surface.
- Preserve provider-reported usage alongside local estimates and treat provider usage as authoritative when available.
- A task is complete only when its code/contracts/docs/tests agree and the final status is supported by evidence.

## Instruction precedence

AgentSam compiles instructions deterministically in this order:

1. `AGENTSAM.md` — stable runtime behavior.
2. `.agentsamrules` — repository-specific rules, loaded after the stable contract and therefore more specific where the two address the same repository behavior.

Live account, authorization, model, run, task, terminal, and usage state never belong in either file.
