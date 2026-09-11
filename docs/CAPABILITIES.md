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
