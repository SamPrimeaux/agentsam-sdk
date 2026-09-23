# @inneranimalmedia/agentsam-contracts

Framework-neutral AgentSam contracts shared by product surfaces. This package has no React dependency and must not know whether the host is Local Studio, CAD Studio, CMS Studio, Fuel & Free Time, or another product.

It owns the portable AgentSam vocabulary: messages, inputs/runs, workbench events, tool calls/capabilities, tool definitions, provider descriptors/adapters, authority requirements, orchestration events, hook definitions, execution receipts, artifacts/attachments, explicit host context, model options, repository/company graph records, and adapter interfaces.

## Execution-plane ownership

The contracts intentionally separate portable definitions from host/provider mechanics:

- **tool definition** — what capability exists, its schemas, authority needs, risk/side effects, idempotency, retry policy, handler reference and emitted events.
- **provider adapter** — provider-specific request/response mechanics only.
- **authority reference** — opaque host-resolved authority; raw tokens and secrets never belong in portable serialized contracts.
- **orchestration event** — a provider, tool, workflow or system fact that can trigger downstream work.
- **hook definition** — when matching events occur, which tool/workflow/event actions should run.
- **execution receipt** — normalized status/output/error/usage/event evidence from an invocation.

MCP, CLI, Work Graph, queue-control, application routes and provider packages should consume/project these same contracts rather than define competing tool schemas.

Provider-specific storage, account/shop identifiers, secrets, business rules, and product state remain host concerns. A provider may emit both its native normalized event and a host/domain event (for example `completeful.order.created` then `commerce.order.created`).

Product state does **not** belong here. Trails/projects, CAD geometry, CMS page schemas, auth/session persistence, fulfillment mappings, shop configuration, and deployment-specific wiring stay with their owning app/package.
