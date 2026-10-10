---
name: agentsam-sam-operations
description: >
  Call, describe, and judge SAM operations (`sam.invoke`, `sam.describe`, `sam.discover`) such as
  repository.inspect, brand.scan, security.scan, package.audit, terminal.exec, planning.goap,
  decision.evaluate, cad.blender.inspect, and codebaseindex.ingest. Use when you need the exact
  input shape of an operation, want to run machinery instead of guessing, or must decide whether
  a result is actually proof. Triggers on "sam.invoke", "operation", "SAM", "run the scan",
  "is this proven", "receipt", and "input shape".
metadata:
  short-description: "Exact inputs for each SAM operation, and how to tell a real result from an empty one"
  aliases:
    - sam
    - sam-operations
    - invoke
    - operations
user-invocable: true
---

# SAM operations

SAM (Systematic Autonomous Machinery) exposes deterministic work as **operations** with one
canonical id (`module.action`). The CLI is a convenience layer; the operation id is the identity.
Full vocabulary: `docs/architecture/SAM_KERNEL.md`.

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

## Exact inputs (verified 2.6.12)

| Operation | Input | Notes |
| --- | --- | --- |
| `repository.inspect` | `{"root":"."}` | Read-only; output is large |
| `brand.scan` | `{"root":".","maxFiles":20}` | Counts donor/`reference/` copies, so token totals can be inflated |
| `security.scan` | `{"root":".","offline":false}` | With `offline:true` it returns `ok` but `status:"incomplete"` and `checked_count:0` |
| `package.audit` | `{"root":".","offline":true}` | Offline leaves public candidates `unchecked` |
| `terminal.exec` | `{"command":"node","args":["-v"]}` | Pathless executable plus argv. No shell strings, no `argv` key |
| `planning.goap` | `{"initialState":{},"goal":{},"actions":[{"id":"a","preconditions":{},"effects":{},"cost":1}]}` | Pure, no model spend |
| `planning.astar` | JS only: `{ initialState, isGoal(fn), expand(fn) }` | `expand` returns `[{ nextState, cost, action }]`. Not callable from JSON, CLI, or MCP |
| `decision.evaluate` | `{"questions":["change_risk"],"state":{}}` | Ids: `terminal_lane`, `retrieval_mode`, `change_risk`, `requires_approval`, `security_review_required`, `verification_scope` |
| `cad.blender.inspect` | `{"source":"model.blend"}` | Needs Blender and a real file (see `agentsam-cad`) |
| `codebaseindex.ingest` | `{"root":"."}` | Writes under `.agentsam/`, may call an embedding provider. Run only when asked |

## Judge the result, not the envelope

- `ok: true` plus a receipt means the operation ran. It does **not** mean the result is complete.
  Always read the data: `status`, `complete`, `checked_count`, `unchecked`.
- A receipt id (`samr_...`) is **not durable evidence**: receipts are in memory only, and
  `agentsam receipts show <id>` reports "not found" afterward. Cite command output, file paths,
  and hashes instead. Re-check with `agentsam receipts list`.
- "Is X proven?" means all of: it has input/output schemas (`sam.describe`), a test calls
  `invoke` and checks the data, and the denied/approval path is exercised for non-read risk.

## Known gaps (2.6.12, re-check before relying)

- Only `repository.inspect` declares input/output schemas; the other nine return none from `describe`.
- These CLI commands name operations that are **not registered**: `machine.inspect`, `engine.audit`,
  `merch.preflight`, `receipts.inspect`, `site.scrape`. Use the CLI for them.
- The agent loop (`src/agent`, `src/providers`) does not reference SAM operations, so a model
  cannot call them yet. Run them yourself.
