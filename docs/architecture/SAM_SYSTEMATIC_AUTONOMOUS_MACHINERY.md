# SAM — Systematic Autonomous Machinery

**Canonical nomenclature and operating standard · 2026-10-17**

> SAM is the portable execution and capability foundation of the AgentSam ecosystem.
>
> It gives developers and intelligent systems a consistent way to discover, reason about, authorize and execute operations across programming languages, applications, devices and services.
>
> SAM preserves specialist runtimes while unifying their contracts, permissions, state, events and verifiable outcomes.
>
> Its purpose is to make sophisticated, interconnected systems accessible through an experience that remains coherent and controllable.
>
> Complex underneath. Effortless above.

## Names and responsibilities

| Name | Exact meaning | Authority |
|---|---|---|
| **SAM** | **Systematic Autonomous Machinery** | Operations, deterministic decisions/planning, capability contracts, policy dispatch, receipts |
| **agentsam** | Lowercase machine-level API and CLI | Invokes registered SAM operations under the installed host authority |
| **AgentSam** | AI-powered wrapper/harness | Interprets requests, selects tools, coordinates model-assisted work, presents results |
| **AgentSamClient** | Public developer SDK facade | Discover, describe, decide, invoke, run, status, events; **not** a new execution engine |
| **Local Studio, miniAgentSam, Side Assistant** | User interfaces into those capabilities | No independent database authority |

SAM is an application/agent operating environment, not a replacement for a general-purpose OS.

## One contract, many specialist owners

The public API must preserve canonical IDs, contracts, error shapes,
authorization outcomes and receipts across languages. The actual work remains
with existing owners: SAM local, ACP durable runs, MCP plugins, IAM identity,
CMS/commerce tenant installations, Go/ExecOS, native Rust/C++ CAD, CoPro and
media engines. Different transports are appropriate; differing policy is not.

A customer installation discovers and invokes its own authorized operations
against its own configured data. An installation does not receive IAM operator
D1 IDs, SQL connection objects, service secrets, or another customer's tenant.
Actor identity, tenant, installation, workspace, scopes, dependency health and
per-action approvals are checked by the executing owner. An LLM decision never
grants permissions.

## Real API scope

| Public method | Existing implementation in this branch | Still missing |
|---|---|---|
| discover | Current SAM OS plus explicitly injected host capability adapter; restricted Python bridge | Unified specialist roster/readiness |
| describe | Current SAM operation definitions; Python bridge | Full cross-host versioned schemas |
| decide | Existing SAM Choose/Check/Score evaluator | Semantic provider and broader six-language parity |
| invoke | Existing SAM handler, authorized host adapter (including live MCP D1 reads), deterministic artifact.render | App/ACP/MCP/native universal authorized dispatch |
| run | Explicitly injected real ACP control-plane client; Python ACP HTTP | Automatic job execution and evidence-linked deliverables |
| events | Existing ACP event retrieval in JS and Python | Durable streaming/replay across all hosts |
| status | Current SAM host registration, effects and dependency caveats | Actor-specific probe/permission/certified evidence across all hosts |

## Execution cannot become a cosmetic demo

Declared → registered → handler-bound → actor authorized → dependency
ready → executed → receipt checked → language/host certified → merged/
installed. A generated ID constant is not a working Go/Rust/C++ SDK. A run
record is not a completed run. Presence of a receipt reference does not
independently validate that receipt.

The deterministic artifact.render handler converts structured findings, plans,
and wireframe section instances into escaped HTML, Markdown and a manifest.
Its evidence references remain *unverified* until a trusted authority validates
them. It does not silently save files or publish. Original customer assets
and compositions must never be overwritten or replaced by a demo fallback.

## Architectural priorities

P0: capability parity, real authorization and IAM read/write scope
consistency, durable ACP/Plan execution with receipts, installation-owned
artifact persistence and presentation. P1: six-language clients; CMS, commerce,
CoPro/MovieMode, CAD, media, IDE and Work Graph host adapters with certified
positive and negative tests.

**Global standard:** Craft over spectacle. Substance over promises.
**Architecture standard:** Complex underneath. Effortless above.

See docs/standards/SAM_MACHINE_BUILD_AND_GAPS.md for executable commands.
