# @inneranimalmedia/agentsam-contracts

Framework-neutral AgentSam contracts shared by product surfaces. This package has no React dependency and must not know whether the host is Local Studio, CAD Studio, CMS Studio, Ember Supply, or another product.

It owns the portable AgentSam vocabulary: messages, inputs/runs, workbench events, tool calls/capabilities, tool definitions, provider descriptors/adapters, authority requirements, orchestration events, hook definitions, execution receipts, artifacts/attachments, explicit host context, model options, repository/company graph records, and adapter interfaces.

## Execution-plane ownership

The contracts intentionally separate portable definitions from host/provider mechanics:

- **tool definition** — what capability exists, its schemas, authority needs, risk/side effects, idempotency, retry policy, handler reference and emitted events.
- **provider adapter** — provider-specific request/response mechanics only.
- **authority reference** — opaque host-resolved authority; raw tokens and secrets never belong in portable serialized contracts.
- **orchestration event** — a provider, tool, workflow or system fact that can trigger downstream work.
- **hook definition** — when matching events occur, which tool/workflow/event actions should run.
- **execution receipt** — normalized status/output/error/usage/event evidence from an invocation.
- **receipt policy** — portable redaction/metadata-only hints so PII, tokens and signing secrets do not leak into durable receipts or prompts.

MCP, CLI, Work Graph, queue-control, application routes and provider packages should consume/project these same contracts rather than define competing tool schemas.

Provider-specific storage, account/shop identifiers, secrets, business rules, and product state remain host concerns. A provider may emit both its native normalized event and a host/domain event (for example `completeful.order.created` then `commerce.order.created`).

Product state does **not** belong here. Trails/projects, CAD geometry, CMS page schemas, auth/session persistence, fulfillment mappings, shop configuration, and deployment-specific wiring stay with their owning app/package.

## Portable operation and tool contract authority

This package is the single source of truth for portable operation and tool definitions:

- `src/operations.ts` owns `AgentOperationContract`, execution policy vocabulary, operation definitions, and normalized operation receipts/results.
- `src/tools.ts` owns `AgentToolDefinition`, tool-call vocabulary, risk, side-effect, idempotency, retry and receipt policy types.
- `schemas/` owns the versioned JSON Schemas for operation contracts, tool definitions and operation results.
- `protocol/` contains stable public schema mirrors. The package test suite requires each mirror to match its package-owned source exactly.

An operation is a product capability with a stable identity and execution policy. A tool is a bounded executable primitive or provider-facing projection. A host may project an operation into one or more tools, but neither the host nor the plugin manifest becomes a competing portable contract authority.

Runtime handlers, local process context, persistence, authorization decisions and product-specific semantics remain with their owning SDK runtime or package. CMS operation semantics remain in `@inneranimalmedia/agentsam-cms`; that package consumes `AgentOperationContract` rather than redefining it.
