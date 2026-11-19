---
name: agentsam-sdk-orientation
description: >
  Find where something lives in the agentsam-sdk repo and which source is authoritative: commands,
  packages, operations, contracts, skills, migrations, and docs, including which docs are
  proposals. Use at the start of work in this repo, before building anything new, and whenever
  you are about to guess. Triggers on "where is", "what do we have", "is there already",
  "catalog", "inventory", "which doc is real", and "orientation".
metadata:
  short-description: "Authoritative source for each kind of thing, and the habit of checking before building"
  aliases:
    - orientation
    - sdk-map
    - where-is-it
    - catalog
user-invocable: true
---

# agentsam-sdk orientation

Most rediscovery comes from not knowing which file is the source of truth. Use this table, then
**check what already exists before adding anything**.

## Start here

```bash
agentsam cheat-sheet        # grouped command overview
agentsam help <topic>       # focused help generated from the command catalog
agentsam skills             # list portable skills
```

## Source of truth by kind

| Question | Authority |
| --- | --- |
| What CLI commands exist? | `src/cli/command-catalog.js` (generated view: `docs/generated/SDK_CAPABILITY_INVENTORY.md`) |
| What packages and apps exist? | `agentsam.yaml`, `packages/catalog/` |
| What can be invoked as an operation? | `src/sam/` (`seed.js` lists registered ops); vocabulary in `docs/architecture/SAM_KERNEL.md` |
| What are portable operation/tool contracts? | `packages/agentsam-contracts/src/operations.ts` and `src/tools.ts` plus package-owned `schemas/`; `protocol/` contains tested public mirrors |
| What are the capability inputs? | `protocol/capabilities/manifest.json` and the `*.schema.json` beside it |
| What rules apply in this repo? | `AGENTSAM.md` (canonical), `.agentsamrules` |
| What skills exist? | `skills/catalog.json` |
| What DB tables does it assume? | `migrations/` and `registry/` |

`docs/generated/SDK_CAPABILITY_INVENTORY.md` says it plainly: **listing is not proof.** A command
or package existing does not mean it works. Run it.

## Vocabulary (do not flatten)

operation = user-callable capability with one id; capability = what the runtime can perform;
tool = bounded executable primitive, often agent-facing; skill = procedural knowledge;
pipeline = ordered composition; provider = adapter to an external or local implementation;
contract = portable schemas and types.

## Portable operation and tool contracts: one authority

- `packages/agentsam-contracts/src/operations.ts` owns `AgentOperationContract`, operation execution policy, and normalized operation receipts/results.
- `packages/agentsam-contracts/src/tools.ts` owns `AgentToolDefinition`, tool-call vocabulary, risk, side-effect, idempotency, retry and receipt policy types.
- `packages/agentsam-contracts/schemas/` owns their JSON Schemas. `protocol/` publishes stable mirrors; package tests enforce exact parity.
- `src/sam/types.js` aliases the shared operation types for the SAM runtime. `defineSamOperation()` binds a runtime handler; it does not redefine the portable contract.
- `src/tools/registry.js` is the runtime registry/controller for shared tool definitions.
- `src/plugins/contracts.js` normalizes a host/plugin manifest into D1 persistence rows; `src/plugins/runtime.js` projects those rows into ephemeral SAM discovery cards. Neither is a portable tool definition. The canonical portable definition is `AgentToolDefinition` from `agentsam-contracts`.

Do not introduce another operation or tool definition vocabulary.

## Doc status

Check a doc's own status line before treating it as spec. Examples: `SAM_KERNEL.md` is a locked
vocabulary with seed contracts; `docs/plans/SAM_WORK_PROTOCOL.md` is a **proposal**. Plans in
`docs/plans/` are intent, not shipped behavior.

## Before building anything new

1. Search: `rg -n "<term>" src packages protocol docs` and the catalog above.
2. Run the nearest existing command or operation and read its output.
3. Extend what exists. Add a new table, registry, or package only when nothing existing fits.

Last verified against agentsam-sdk 2.6.12.
