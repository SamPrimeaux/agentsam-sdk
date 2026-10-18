# Deterministic capabilities and product presets

AgentSam SDK treats useful mechanics as deterministic capabilities first. Model/agent orchestration is an optional consumer of those capabilities, not a prerequisite for using them.

## Contract

A capability has a stable ID, kind, runtime, side-effect class, CLI/library entry point where applicable, and explicit model requirement. The canonical data SSOT is `protocol/capabilities/manifest.json`; `src/capabilities/manifest.js` is only its runtime reader. Presets follow the same rule through `protocol/presets/catalog.json`.

```js
import { getCapabilityManifest, repositorySnapshot } from '@inneranimalmedia/agentsam-sdk/capabilities';
import { getPresetCatalog } from '@inneranimalmedia/agentsam-sdk/presets';
```

Raw machine-readable data is also shipped through the `/capability-manifest` and `/preset-catalog` package subpaths.

```sh
agentsam capabilities
agentsam capabilities repository.snapshot --json
```

This registry is intended to drive CLI/terminal UI discovery, AgentSam/MCP tool selection, docs, verification, and workflow capability resolution. It is deliberately not a second hosted tools database.

## Current registry inventory (source-backed)

The manifest at `protocol/capabilities/manifest.json` is the declaration SSOT; `src/registry/index.js` joins it to the command catalog and package inventory. The entries below are **stable declarations in this checked revision**, not a promise that every operation is bound or authorized on every host. Entries marked **†** explicitly have `deterministic: false` in the manifest, even though they share the same capability namespace.

| Domain | Stable capability IDs |
| --- | --- |
| database | `agentsam_cf_d1_list †`, `agentsam_d1_query †`, `agentsam_d1_write †`, `agentsam_d1_delete †`, `cloudflare.d1.schema`, `agentsam_sqlite_list`, `agentsam_sqlite_get`, `agentsam_sqlite_create`, `agentsam_sqlite_delete`, `agentsam_sqlite_restore`, `agentsam_d1_create †`, `agentsam_sqlite_edit` |
| planning | `plan.list`, `plan.show`, `plan.next`, `plan.create`, `plan.step.add`, `plan.step.status`, `plan.step.evidence`, `plan.step.accept`, `plan.step.depends`, `plan.status`, `planning.goap` |
| repository | `project.discover`, `machine.inspect`, `workspace.read`, `workspace.list`, `workspace.search`, `workspace.write`, `repository.snapshot`, `repository.audit †`, `repository.intelligence`, `knowledge.index`, `knowledge.search`, `repository.crawl`, `repository.mine`, `project.list`, `project.get`, `project.create`, `project.edit`, `project.delete`, `project.restore` |
| tool | `test.run †`, `capability.search`, `capability.describe`, `capability.status`, `capability.invoke` |
| integrity | `merkle.snapshot` |
| delivery | `deploy.receipt` |
| security | `security.scan` |
| brand | `brand.scan`, `brand.resolve`, `brand.plan` |
| app | `identity.init`, `scaffold.create` |
| agent | `recon.pack` |

Additional entries, including CAD/Blender, site scraping, workgraph, terminal execution, and cloud profiling, carry `experimental` manifest status. Inspect the current manifest/registry rather than silently promoting them to stable or pretending they are absent.

```bash
agentsam capabilities --inventory --json
agentsam capabilities --inventory --commands --search machine
agentsam capabilities --inventory --packages --search brand
agentsam explain capability workspace.write
agentsam explain command app
```

The host must still resolve a real handler, platform/provider installation, runtime availability, actor and project scope, and operation-specific authorization. `capability.status` reports handler binding/availability; `capability.invoke` only calls an allowlisted handler with host approval. A manifest `status: stable` is **not** evidence of a healthy execution backend or a shipped end-user application. `repository.audit` is an `agent_primitive` requiring an injected reasoner rather than a deterministic collector.

### Four distinct inventories

| Inventory | Canonical owner | Meaning |
| --- | --- | --- |
| CLI commands | `src/cli/command-catalog.js` | Actual `agentsam ...` entrypoints and help; the [cheat-sheet](reference/AGENTSAM-CLI-WORKFLOWS.md) is a curated view |
| Capabilities | `protocol/capabilities/manifest.json` + host adapter | Protocol IDs, schemas, side effects, status, optional `cli`; binding and authorization are separate |
| Toolchain recipes | `src/lib/setup/recipes.js` | Four provider-native prerequisite recipes, not all capability IDs; see [setup contract](contracts/capability-install-planner.md) |
| APP products and plugin installs | `agentsam.app.json` / platform product registry / host installation records / plugin account registry | A reusable app definition, a platform catalog record, a local build inclusion and an account-installed application are different facts |

**Product model:** AgentSam CLI/SDK orchestrates a substantial collection of existing applications and domain packages. Docs should document working entrypoints and independent domain ownership rather than call them demos; equally, unverified host journeys should remain labeled *implemented*, *verified*, *deployed*, or *shipped* using the [delivery closure contract](standards/DELIVERY_CLOSURE.md).

The portable public CMS contract is for editable public website content, themes, sections, branding, media and publication—not CAD, commerce, manufacturing, billing or machine resource records. Specialized products compose with CMS without surrendering their domain tables to it. App-local `packages/` directories are a packaging location, **not automatic proof** that every contained package is intentionally private or ineligible for SDK reuse.

## repository.snapshot

`repository.snapshot` is the first canonical composition primitive. It performs one read-only evidence collection pass over the current checkout and combines existing SDK mechanics:

- Git resource identity and revision
- Python repository intelligence
- Merkle root, semantic metadata root, execution-domain facts, and tree statistics
- deterministic client/server trust-boundary contradictions derived from the Merkle-bound AST graph
- package/manifests
- local knowledge/index generation when configured
- last trusted local deployment receipt when available
- a content hash over the collected evidence

It does **not** call an LLM, mutate source, index the repository, provision cloud resources, or invent platform account/workspace authority.

```sh
agentsam inspect --json
agentsam inspect --execution-domain browser --view files --json
```

```js
import { repositorySnapshot } from '@inneranimalmedia/agentsam-sdk/repository';
const snapshot = await repositorySnapshot({ cwd: process.cwd() });
```

The timestamp is not included in the content hash, so unchanged evidence produces the same `content_hash` and `snapshot_id`. The default bounded index view carries a compact `analysis.trust_boundary` summary (up to 20 contradiction cards) while the canonical full snapshot retains all deterministic findings. `agentsam security scan` consumes the same analyzer rather than maintaining a separate architecture model.

## Optional AgentSam/LLM composition

`repository.audit` is intentionally a different kind of manifest entry: an `agent_primitive`, not a deterministic evidence collector. It accepts a certified `repository.snapshot`, builds a bounded read-only evidence packet, and requires the caller to inject a `reasoner(packet)` function. The SDK does not choose a provider or model.

```js
import { createCapabilityAdapter, runRepositoryAudit } from '@inneranimalmedia/agentsam-sdk/agent';

const audit = await runRepositoryAudit({
  snapshot,
  reasoner: async packet => myModelAnalyze(packet),
});
```

The audit validator rejects mutation-oriented output keys such as jobs, executions, commits, deployments, mutations, and patches. A host Workflow may later turn validated findings/routes into plans or proposed jobs; that durable process remains outside the SDK.

`createCapabilityAdapter()` converts the same canonical manifest into a small executable tool surface. Built-in `repository.snapshot` is available without a model; `repository.audit` becomes available only when a reasoner is supplied; other capability handlers can be injected explicitly by a host. This is the intended search-and-execute boundary rather than exposing every SDK command to every agent turn.

## Product UX and power-user UX

Product entry points are intentionally small:

```sh
agentsam create myapp --preset fullstack
agentsam add knowledge
agentsam dev
agentsam inspect
agentsam deploy
```

Power-user primitives remain available:

```sh
agentsam repo snapshot
agentsam index ...
agentsam search ...
agentsam merkle ...
agentsam recon ...
agentsam security ...
agentsam deploy-receipt ...
```

Presets select a coherent starting configuration; they do not silently provision remote services. `agentsam add` records an explicit feature selection in `.agentsam/features.json`; feature-specific commands continue to own real mutations until an additive handler can satisfy the complete feature contract safely.

## Ownership boundary

The SDK owns portable deterministic implementations and contracts. A host platform owns actor authorization, account ownership, workflow durability, approvals, job materialization, provider credentials, and application records. Portable repository capabilities must never infer actor authority from Git, workspace, or tenant labels.
