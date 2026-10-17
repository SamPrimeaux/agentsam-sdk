# SAM Machine Build and Gap Acceptance

**Execution handoff · 2026-10-17**

The commands here operate on current repository implementations; they do not
invent generated-only operations or silently update customer/production data.

## Build now

    node scripts/sam-machine/build.mjs --out /tmp/sam-machine-build --project . --verify
    bash scripts/sam-machine/verify.sh /tmp/sam-machine-acceptance
    node scripts/sam-machine/gate.mjs --input /tmp/sam-machine-acceptance/acceptance.json --require js,python
    node scripts/sam-machine/gate.mjs --input /tmp/sam-machine-acceptance/acceptance.json --require all
    # With separate IAM MCP authorization; optional live read-only proof:
    node scripts/sam-machine/live-mcp-check.mjs --database YOUR_DATABASE_UUID

The final all-language gate intentionally fails until supported, verified
clients exist. The build generates catalog.json, acceptance.json, report.html,
report.md, manifest.json, inspection receipt and generated operation-ID
projections for TypeScript/Python/Go/Rust/C++. ID projections do not count as
working clients or handlers.

## Implemented in the integration worktree; merge still required

- Real AgentSamClient status, decide, run, events, and injected host capability dispatch facades.
- Existing SAM decision engine reused, no fabricated model decisions.
- Real ACP client used for run creation/wait/events; it DOES NOT automatically
  execute arbitrary operations nor falsely complete a Plan.
- Deterministic artifact.render: HTML/MD/report manifest + receipt; no implicit
  writes, no claims of verified evidence merely because refs were supplied.
- Real Python sync/async safe-local bridge and explicit ACP HTTP run adapter.
- Live positive read-only MCP list/query through the public AgentSamClient; write approval remains separate.
- Runnable machine catalog generator with conformance checks for JS and Python.

## Release-blocking gaps

| ID | Severity | Exit condition | Status |
|---|---|---|---|
| SAM-001 | P0 | One authoritative operation identity and cross-host projections | Partial |
| SAM-002 | P0 | Invoke real handler across local/MCP/ACP/app/native where configured | Partial |
| SAM-003 | P0 | Per-actor readiness with authorized/dependency/verified separate | Partial |
| SAM-004 | P0 | Versioned typed schemas and generated client bindings | Partial |
| SAM-007 | P0 | IAM consent scopes match actual token/write allowlist | OPEN SECURITY |
| SAM-009 | P0 | ACP/Plan actually executes steps and stores acceptance receipts | Partial |
| SAM-010 | P0 | Full run artifact lifecycle storage, versions, editing and publish | Partial |
| SAM-012 | P0 | Tenant isolation proved end-to-end for consumer CMS and commerce | Open |
| SAM-CL-TS | P0 | Real TS typed public facade and compile-time schema conformance | Open |
| SAM-CL-PY | P0 | Python remote/app parity and release packaging | Partial |
| SAM-CL-GO | P0 | Actual Go client handlers + security and receipt conformance | Open |
| SAM-CL-RS | P0 | Actual Rust client/native ops and conformance | Open |
| SAM-CL-CPP | P0 | Actual C++ client/native ops and conformance | Open |
| SAM-APP-CMS | P0 | Real CMS edit/preview/publish via installed authorized adapter | Open |
| SAM-APP-COPRO | P1 | CoPro timeline/render/media host integration and receipts | Open |
| SAM-APP-MEDIA | P1 | Media versioning/storage/derivatives authority parity | Open |
| SAM-APP-CAD | P1 | Native CAD/Rust/C++ operations across supported surfaces | Open |
| SAM-APP-IDE | P1 | IDE, Local Studio and miniAgentSam parity | Open |

No capability is certified from generated catalogs alone. Every ticket needs
source owner, real handler, permission and negative tests, positive execution
receipt, installation context, PR and deployed consumer verification.

## Repeatable implementation procedure

1. Generate catalog and compare IDs/schemas to existing owner code.
2. Find the actual handler; extend its adapter, never create parallel DB tables.
3. Attach identity/tenant/approval checks at the executing authority.
4. Add real positive/negative conformance tests (including denied writes).
5. Run machine verification and evaluate provenance/evidence.
6. Merge; install the new package/host; prove the consumer workflow.
7. Update the gap register with source, receipt, tests, PR and status.


## Resource CRUD expansion · 2026-10-17

Project resource lifecycle now binds project.list, project.get, project.create,
project.edit, project.delete (archive) and project.restore against owned
workspace directories. Local SQLite lifecycle binds agentsam_sqlite_list/get,
create/edit/delete (archive)/restore and real disk database files. An explicit
Cloudflare D1 REST provisioner exists behind a trusted customer installation
credential resolver and host write authorization; the production MCP catalog
entry is dormant pending IAM write-scope reconciliation.

Run:

    node scripts/sam-machine/crud-smoke.mjs
    node scripts/sam-machine/crud-coverage.mjs --out /tmp/sam-resource-gaps.json
    node scripts/sam-machine/gate.mjs --input /tmp/sam-machine-build/acceptance.json --require js,python,project_crud,sqlite_crud

Cloudflare D1 **database resource** get/update/delete still need separate
provider contracts; row SQL operations do not satisfy these lifecycle gates.
Refer to docs/architecture/SAM_RESOURCE_CRUD_STANDARD.md.
