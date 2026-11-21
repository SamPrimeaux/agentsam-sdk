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

- `src/operations.ts` owns `AgentOperationContract`, execution policy vocabulary, `assertAgentOperationContract()`, operation definitions, and normalized operation receipts/results.
- `src/tools.ts` owns `AgentToolDefinition`, tool-call vocabulary, risk, side-effect, idempotency, retry and receipt policy types, plus `assertAgentToolDefinition()` as the framework-neutral runtime guard.
- `schemas/` owns the versioned JSON Schemas for operation contracts, tool definitions and operation results.
- `protocol/` contains stable public schema mirrors. The package test suite requires each mirror to match its package-owned source exactly.

An operation is a product capability with a stable identity and execution policy. A tool is a bounded executable primitive or provider-facing projection. A host may project an operation into one or more tools, but neither the host nor the plugin manifest becomes a competing portable contract authority.

`src/tools/registry.js` is the SDK runtime registry/controller and delegates definition validation to `assertAgentToolDefinition()`. Runtime handlers, local process context, persistence, authorization decisions and product-specific semantics remain with their owning SDK runtime or package. CMS operation semantics remain in `@inneranimalmedia/agentsam-cms`; that package consumes `AgentOperationContract` rather than redefining it.


## Universal source-format identity

- Canonical catalog: `contracts/source-types.v2.json`.
- Canonical Draft 2020-12 schema: `contracts/source-types.v2.schema.json`.
- `src/source-types.ts` exports the framework-neutral reference and identification types.
- The package build copies the canonical catalog and schema into `schemas/` for npm consumers; those package files are generated mirrors, not a second authority.
- The catalog describes identity and detection evidence only. Runtime adapters separately declare real inspect, import, preview, validate, convert, transcode and export capabilities.
- V1 identifiers remain available through the explicit `compatibility.legacyIdMappings` map.

## Scene-format capability contract

The portable `agentsam.scene-format.v1` contract lives in
`src/scene-format.ts` and is exported from both the package root and
`@inneranimalmedia/agentsam-contracts/scene-format`.

It defines four independent operations—`import`, `export`, `live-reference`,
and `round-trip`—plus optional `sourceTypeIds` linking to the existing
source-type identity catalog, a typed capability descriptor, a SHA-256 source-reference
receipt (explicitly labeled `identification: extension-hint`), and a semantic round-trip receipt. `assertSceneFormatCapability()`
rejects missing operation declarations; `assertSceneFormatRoundTripReceipt()`
rejects reports that simultaneously claim a successful round-trip and
lost properties. This is a **contract only**: no parsers, geometry kernels,
renderers, filesystem access, account identity or tool permissions are created
by importing it.

Use `@inneranimalmedia/iamscene` for actual format adapters. The universal
file-identity catalog is separately owned by `contracts/source-types.v2.json`
and mirrored into this package during build. Identifying a file by suffix,
media type or magic bytes cannot imply that a format adapter is available.
The root capability manifest is a discoverable SDK API directory, not a
hosted execution grant.

## ResourceRef — independent file/asset/scene/project identity

The `agentsam.resource-ref.v1` contract lives at `src/resource-ref.ts` and is
available at `@inneranimalmedia/agentsam-contracts/resource-ref`, with a
Draft 2020-12 JSON Schema at `./resource-ref/schema`.

The supported resource variants are `file(mount,path)`, `asset(id)`,
`scene(id)` and `project(id, revision?)`. There is **no mandatory project ID**
for a loose-file operation. File references are relative to mounts explicitly
provided and authorized by the runtime; the contract is not itself an access
grant, arbitrary filesystem path or storage implementation. A file's SHA-256
is the natural optimistic concurrency token, while a project may use its
separate native revision history.
