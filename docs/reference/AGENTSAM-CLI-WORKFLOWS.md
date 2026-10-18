# AgentSam CLI: product workflows and authoritative command entrypoints

**Snapshot:** 2026-10-18, aligned with `src/cli/command-catalog.js` and `src/commands/cheat-sheet.js`.  
**Sources:** `agentsam cheat-sheet [--json]`, `agentsam capabilities --inventory --json`, [capability manifest](../../protocol/capabilities/manifest.json), [application contract](../architecture/AGENTSAM_APPLICATION_CONTRACT.md).

AgentSam is a product platform with usable, independently owned applications, packages and execution machinery—not a collection of sample commands. The CLI is one user-facing control surface. The registry supports capability discovery, and host agents may invoke a subset only after handler binding and authorization.

`agentsam cheat-sheet` is curated guidance, **not** the command registry itself. `src/cli/command-catalog.js` is canonical for top-level CLI entrypoints; the capability manifest is canonical for `capability.*` IDs; `agentsam.app.json` is canonical for APP identity; install/connection records prove installation.

## Find what actually exists

```bash
agentsam cheat-sheet
agentsam cheat-sheet --json
agentsam capabilities
agentsam capabilities --inventory --json
agentsam capabilities --inventory --commands --search machine
agentsam capabilities --inventory --packages --search workbench
agentsam explain capability repository.snapshot
agentsam explain command app
```

The first group prints the CLI, registry and package descriptions. It does not grant permission or prove that a host plugin has an executable handler. For agent operations, distinguish `capability.search` / `capability.describe` (discovery), `capability.status` (binding), and `capability.invoke` (allowlisted host-authorized execution). CLI commands are **not** themselves all exposed as model tools.

## Real workflows

| User outcome | Entry commands | Expected output or authority |
| --- | --- | --- |
| Inspect an existing codebase | `agentsam inspect --json`, `agentsam machine inspect <path>`, `agentsam machine crawl <path>`, `agentsam machine mine <path> --against <path>` | Certified snapshot, native path evidence, repository graph and reuse candidates |
| Search project knowledge | `agentsam index status`, `agentsam index run`, `agentsam search "query"` | Local/portable generation and bounded retrieval; indexing changes local state |
| Detect and improve a brand | `agentsam brand scan`, `agentsam brand resolve`, `agentsam brand plan` | Observed visual evidence, inferred roles and proposed changes; scan/resolve/plan do **not** rewrite the source |
| Track goals and acceptance | `agentsam plan`, `agentsam goap` | Repository-scoped plan/task evidence and dry-run GOAP planning |
| Build a project | `agentsam create <name> --preset <preset>`, `agentsam add <feature>`, `agentsam dev` | Explicit scaffold/feature selection and project development; cloud provisioning is separate |
| Work with local data | `agentsam db` | Workspace SQLite; do not imply this automatically reaches the authenticated Cloudflare D1 account |
| Validate runtime state | `agentsam setup runtime --dry-run`, `agentsam runtime doctor --json`, `agentsam connections` | Placement plan and actual runtime/connection evidence; a profile plan is not enrollment |
| Prepare a native dependency | `agentsam setup --list`, `agentsam setup <recipe> --dry-run` | Explicit OS/native package recipe and mutation plan |
| Discover and inspect applications | `agentsam app list`, `agentsam app inspect <id>`, `agentsam app validate --all` | APP manifests and validation findings |
| Find application distribution instructions | `agentsam app install <id>` | **Prints** npm/curl installation instructions; current CLI does not execute them or create a durable user installation record |
| Manage plugins | `agentsam plugins`, `agentsam plugin inspect <target>` | Governed plugin/catalog integration; installation, connection, approval and tool-readiness are separate |
| Inspect delivery evidence | `agentsam receipts`, `agentsam deploy-receipt capture`, `agentsam security scan` | Content-addressed receipts and trust-boundary findings; not proof of a deployed customer journey by themselves |
| Review identity / providers | `agentsam whoami`, `agentsam credentials audit --verify`, `agentsam providers`, `agentsam google-cloud doctor` | Account, credential-name-only status, provider/connection diagnostics |

A documented command may still require the relevant runtime, local project, network connection or scope. To discover the current command behavior, use `agentsam <root> --help` where supported or `agentsam explain command <root>`.

## Installation is a separate product operation

```text
APP manifest ──────────── product definition / code distribution
included_apps / embed ── build-time inclusion in a packaged release
npm / native provider ── package and toolchain installation
agentsam setup runtime ─ placement plan + possible agentsamd adapter setup
host-install record ──── installed APP instance, account/host scoped
plugin registration ─── account record, then separate OAuth/tool authorization
capability registry ─── declaration → handler resolution → approval → execution
```

Do not use a build manifest, `npm pack` result, plugin catalog icon, or `agentsam app list` output as proof that a user can click to install a new application after downloading Local Studio. Host installation must be separately implemented, persisted, and verified in its intended product surface. Conversely, **do not downgrade implemented native CAD, branded CMS/editor, machine, brand, or database engines to “demo” merely because their cross-product installation loop is still incomplete.**

## User authority and data boundaries

The account API key, per-machine bridge key, Identity OAuth configuration and external provider tokens are separate authority lanes. Portable Local Studio does not inherit an InnerAnimalMedia operator installation or Cloudflare access merely by running the SDK. See [environment vocabulary](../contracts/environment-vocabulary.md) and [distribution ownership](../architecture/AGENTSAM_DISTRIBUTION_OWNERSHIP.md).

Remote D1 tool operations (`agentsam_cf_d1_list`, `agentsam_d1_query`, `agentsam_d1_write`, `agentsam_d1_delete`, `agentsam_d1_create`) are host/provisioner-bound capabilities with explicit Cloudflare and write authorization. They are **not** aliases for local `agentsam db` commands. SQL writes/deletes must pass their own approval gate. Host capability `capability.invoke` cannot bypass this gate.

## Documentation/verification rules

- Treat [`protocol/capabilities/manifest.json`](../../protocol/capabilities/manifest.json) as declarations; use `capability.status` to discover handler availability.
- Treat `src/cli/command-catalog.js` as the command authority; keep `src/commands/cheat-sheet.js` synced and tested.
- Treat `src/lib/setup/recipes.js` as the exact toolchain install inventory, not a surrogate for the capability registry.
- Describe product state precisely: *declared*, *packaged*, *implemented*, *verified*, *merged*, *deployed*, or *shipped*. Never infer the latter from an earlier state.
- For local product acceptance use actual end-to-end surfaces, authenticated host providers, functional launch/setup flows, source commit identity and [delivery receipts](../standards/DELIVERY_CLOSURE.md).

This document intentionally avoids claiming that all published product packages are independently installed, or that every `stable` protocol capability is directly runnable without a host.
