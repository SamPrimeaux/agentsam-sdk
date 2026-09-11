# Deterministic capabilities and product presets

AgentSam SDK treats useful mechanics as deterministic capabilities first. Model/agent orchestration is an optional consumer of those capabilities, not a prerequisite for using them.

## Contract

A capability has a stable ID, runtime, side-effect class, CLI/library entry point where applicable, and explicit model requirement. The canonical registry lives in `src/capabilities/manifest.js` and is exposed through:

```js
import { getCapabilityManifest, repositorySnapshot } from '@inneranimalmedia/agentsam-sdk/capabilities';
```

```sh
agentsam capabilities
agentsam capabilities repository.snapshot --json
```

This registry is intended to drive CLI/TUI discovery, AgentSam/MCP tool selection, docs, verification, and workflow capability resolution. It is deliberately not a second hosted tools database.

## repository.snapshot

`repository.snapshot` is the first canonical composition primitive. It performs one read-only evidence collection pass over the current checkout and combines existing SDK mechanics:

- Git resource identity and revision
- Python repository intelligence
- Merkle root and tree statistics
- package/manifests
- local knowledge/index generation when configured
- last trusted local deployment receipt when available
- a content hash over the collected evidence

It does **not** call an LLM, mutate source, index the repository, provision cloud resources, or invent platform account/workspace authority.

```sh
agentsam inspect --json
```

```js
import { repositorySnapshot } from '@inneranimalmedia/agentsam-sdk/repository';
const snapshot = await repositorySnapshot({ cwd: process.cwd() });
```

The timestamp is not included in the content hash, so unchanged evidence produces the same `content_hash` and `snapshot_id`.

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
