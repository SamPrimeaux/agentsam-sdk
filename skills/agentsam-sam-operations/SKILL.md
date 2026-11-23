---
name: agentsam-sam-operations
description: >
  Call, describe, and judge SAM operations (`sam.invoke`, `sam.describe`, `sam.discover`) such as
  repository.inspect, brand.scan, security.scan, package.audit, terminal.exec, planning.goap,
  decision.evaluate, cad.blender.inspect, arch.* reference lookups, and codebaseindex.ingest.
  Use when you need the exact input shape of an operation, want to run machinery instead of
  guessing, or must decide whether a result is actually proof.
  Triggers on "sam.invoke", "operation", "SAM", "run the scan", "is this proven", "receipt",
  "input shape", "describe operation".
metadata:
  short-description: Exact inputs for each SAM operation, and how to tell a real result from an empty one
  aliases:
    - sam
    - sam-operations
    - invoke
    - operations
user-invocable: true
---

# SAM operations

SAM (Systematic Autonomous Machinery) exposes deterministic work as operations with one canonical
id (`module.action`). The CLI is a convenience layer; the operation id is the identity. Full
vocabulary: `docs/architecture/SAM_KERNEL.md`.

Verified against SDK 2.6.18 plus the `cad.bim.ifc.*` operations added after it. The registry grows between releases, so re-run the discovery
commands below before relying on any table here.

## Find out what exists

```sh
agentsam sam list                       # the registry
agentsam sam describe repository.inspect   # summary, risk, lanes, input_schema when declared
agentsam sam discover <query> --json
agentsam sam doctor                     # installed handlers and availability
```

`discover` returned a subset of the registry (20 of 26 in 2.6.18), so use `list` for the full set
and `describe <id>` for any id you already know. `describe` returns `risk` (`read_only` or `write`), `status`, and `input_schema` when the
operation declares one; `discover` cards also list the execution `lanes`.

## Call one

```js
import { createAgentSamClient } from '@inneranimalmedia/agentsam-sdk';

const sam = createAgentSamClient({ cwd: process.cwd() });
const r = await sam.invoke('repository.inspect', { root: '.' });
// r.ok, r.data | r.error, r.receipt.id
await sam.describe('codebaseindex.ingest');   // metadata without running it
await sam.discover({ query: 'brand' });       // compact cards
```

There is no `agentsam invoke` verb. Use the client, or the matching CLI command.

## Exact inputs

"Checked" says how each row was confirmed in 2.6.18: **run** (invoked, envelope inspected),
**schema** (input shape read from `describe`, not invoked), **carried** (from the previous verification, not re-run).

| Operation | Input | Checked | Notes |
|---|---|---|---|
| `repository.inspect` | `{"root":"."}` | schema | Read-only; output is large |
| `brand.scan` | `{"root":".","maxFiles":20}` | run | Counts donor/reference/ copies, so token totals can be inflated |
| `security.scan` | `{"root":".","offline":false}` | run | With `offline:true` it now returns `ok:false`, `status:"incomplete"`, `checked_count:0` |
| `package.audit` | `{"root":".","offline":true}` | run | `ok:true` is only the envelope. Offline leaves public candidates unchecked; read the data |
| `terminal.exec` | `{"command":"node","args":["-v"]}` | run | Pathless executable plus argv. No shell strings, no `argv` key. Risk: `write` |
| `planning.goap` | `{"initialState":{},"goal":{},"actions":[{"id":"a","preconditions":{},"effects":{},"cost":1}]}` | run | Pure, no model spend |
| `planning.astar` | JS only: `{ initialState, isGoal(fn), expand(fn) }` | carried | `expand` returns `[{ nextState, cost, action }]`. Not callable from JSON, CLI, or MCP |
| `decision.evaluate` | `{"questions":["change_risk"],"state":{}}` | run | Ids: `terminal_lane`, `retrieval_mode`, `change_risk`, `requires_approval`, `security_review_required`, `verification_scope` |
| `cad.blender.inspect` | `{"source":"model.blend"}` | run (error path) | Needs Blender and a real file; a missing file returns `ok:false` with the path (see `agentsam-cad`) |
| `cad.bim.ifc.inspect` | `{"input":"model.ifc"}` | run | Read-only. Needs IfcOpenShell (found automatically). Check `model.truncated` |
| `cad.bim.ifc.validate` | `{"input":"model.ifc"}` | run | Read-only. Schema validation only |
| `cad.bim.ifc.diff` | `{"input":"a.ifc","other":"b.ifc"}` | run | Read-only. By GlobalId; states what it does not compare |
| `cad.bim.ifc.edit` | `{"input":"a.ifc","output":"b.ifc","base":"<sha256>","edits":[...]}` | run | Risk `write`. New copy only; see `agentsam-arch-bim` for the edit list and guarantees |
| `codebaseindex.ingest` | `{"root":"."}` | carried | Risk `write`. Writes under `.agentsam/`, may call an embedding provider. Run only when asked |
| `arch.assembly.thickness` | `{"layers":[{"name":"...","thickness_in":0.5}]}` | run | 1-128 layers; sums only the layers given, never infers missing ones |
| `arch.material.lookup` | `{"nominal":"2x4","condition":"surfaced_dry"}` | run | `nominal` is one of 2x4, 2x6, 2x8, 2x10, 2x12 |
| `arch.qa.compare_dimensions` | `{"expected_in":96,"measured_in":95.9,"tolerance_in":0.125}` | run | Compares two independent measurements; all three fields required |
| `arch.references.list` | `{}` or `{"ids":["..."]}` | run | Curated authority URLs and licences; does not fetch pages |
| `arch.capabilities.status` | `{}` | run | Discloses implemented reference capabilities; makes no CAD engine claims |

Other registered families (`artifact.render`, `robotics.*`) declare no input schema. Do not guess
their inputs: read `describe` for the summary, and if the shape is not stated, say so instead of
trying payloads.

## Judge the result, not the envelope

- `ok: true` plus a receipt means the operation ran. It does not mean the result is complete.
  Always read the data: `status`, `complete`, `checked_count`, `unchecked`.
- A receipt id (`samr_...`) is not durable evidence. Right after an invoke,
  `agentsam receipts show samr_...` reports "not found"; `receipts list` reads a local cache of
  other receipt kinds, and a durable catalog needs a host adapter. Cite command output, file
  paths and hashes.
- "Is X proven?" means all of: it has schemas (`describe`), a test calls `invoke` and checks the
  data, and the denied/approval path is exercised for non-read risk.
- A failed operation returns `ok:false` with `error.code` (for example `sam_operation_failed`) and
  a message. Relay the message; do not retry with invented inputs.

## Known gaps (2.6.18, re-check before relying)

- Six operations declare an `input_schema` (`repository.inspect` and the five `arch.*`). No
  operation declares an `output_schema`, so result fields must be read, not assumed.
- These CLI commands name operations that are not in the registry: `machine.inspect`,
  `engine.audit`, `merch.preflight`, `receipts.inspect`, `site.scrape`. Use the CLI for them.
- A model can call SAM operations only in a host that wires `createSamCapabilityAdapter` into the
  capability adapter. Nothing in the SDK does that by default, so otherwise run operations
  yourself.
- IFC can be read, validated, diffed and edited, but there is no general project-to-IFC export:
  `cad.bim.ifc.export` is a declared intention, not a registered operation (see `agentsam-arch-bim`).
