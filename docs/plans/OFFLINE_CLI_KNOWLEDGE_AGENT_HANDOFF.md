# Agent handoff — full package catalog + offline software decision helper

## Scope

Treat every real package under `packages/` consistently.

Do not manually write 57 manifests from package names.

Use deterministic machinery to extract facts and create reviewable drafts.

Required end-state:

```text
agentsam explain rust
agentsam explain workers
agentsam explain wasm
agentsam explain rapid-rust
agentsam explain package agentsam-hooks
agentsam explain package agentsam-workbench

agentsam choose runtime --goal reusable-native-logic
agentsam assist
agentsam doctor
```

All must work from the packed product without an LLM.

## `assist` must teach, not just choose

The helper should reason through explicit, deterministic questions:

1. What are you building?
2. Where must it run?
3. Is it request/response or long-running?
4. Does it need native OS/process/filesystem access?
5. Is there a browser/UI surface?
6. Must business/domain logic be reusable across hosts?
7. Are incoming requests signed/authenticated?
8. Is the workload bounded or heavy/long-running?
9. Is portability more important than native system access?
10. Does the user already have a preferred language/runtime constraint?

Then return:

- primary recommendation;
- why it fits;
- why obvious alternatives do not fit as well;
- packages/templates to use;
- prerequisites;
- install commands;
- verification commands;
- starter commands;
- related `agentsam explain ...` topics.

Never answer only "missing cargo" / "missing worker-build".
Give repair instructions and continuation commands.

## Full package treatment

Every package gets an `agentsam.package.json`.

But there are two stages:

### Stage A — machine draft

Facts may be derived from:
- npm/Cargo manifest;
- README;
- exports;
- dependency names;
- source-language extensions;
- explicit package description;
- workspace/public/private flags.

Draft status:

```json
"catalog_status": "needs-review"
```

unless all required product fields are already explicit and trustworthy.

### Stage B — reviewed authority

Only after review:

```json
"catalog_status": "classified"
```

The build gate may allow `needs-review` in development but release/public publication must report or reject incomplete public records.

## No rediscovery tax

The package manifest becomes the package-owned product knowledge authority.

Do not duplicate the same prose in:
- CLI command handlers;
- public website;
- docs app;
- Local Studio;
- random root-level catalog files.

Generate aggregates from package-owned data.
