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
| What are the wire contracts? | `protocol/` (JSON Schemas) and `packages/agentsam-contracts` |
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

## Tool definitions: three shapes already exist

1. `SamOperationDef` via `defineSamOperation()` in `src/sam/define.js`.
2. `AgentToolDefinition` in `packages/agentsam-contracts/src/tools.ts`, used by `createToolRegistry()` in `src/tools/registry.js`.
3. The plugin manifest normalizer in `src/plugins/contracts.js`, which maps to rows in the D1 `agentsam_tools` table.

Reuse one of these. Do not add a fourth.

## Doc status

Check a doc's own status line before treating it as spec. Examples: `SAM_KERNEL.md` is a locked
vocabulary with seed contracts; `docs/plans/SAM_WORK_PROTOCOL.md` is a **proposal**. Plans in
`docs/plans/` are intent, not shipped behavior.

## Before building anything new

1. Search: `rg -n "<term>" src packages protocol docs` and the catalog above.
2. Run the nearest existing command or operation and read its output.
3. Extend what exists. Add a new table, registry, or package only when nothing existing fits.

Last verified against agentsam-sdk 2.6.12.
