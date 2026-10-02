# AgentSam Local Engine & Compute Audit Plan

**Audit date:** 2026-10-02 (UTC)  
**Repository:** `@inneranimalmedia/agentsam-sdk`  
**Branch:** `arena/01a0fae5-agentsam-sdk`  
**Scope:** Apple Silicon inventory, portable local-engine contract, benchmark harness, and model/cache governance.

This is an implementation plan grounded in the current checkout. It deliberately does not claim that the repository's build host is an Apple Silicon machine or that any local engine is installed: those are runtime facts that the future audit command must discover on the operator's machine.

## 1. Executive assessment

AgentSam already has useful foundations, but not the requested universal local-engine layer.

### Existing strengths

- Local-first runtime and user-space ownership are established conventions. `~/.agentsam` is already used for managed Machine and AgentSam runtimes, while project state remains under `.agentsam/`.
- The repository has a strong deterministic-machinery boundary in `AGENTSAM.md`: inspectable evidence owns facts; models may augment but must not override capability evidence.
- Hardware identity primitives exist in `src/lib/terminal/machine-identity.js` and can normalize platform, architecture, hostname, and hardware model without a host-specific path.
- A managed native Machine runtime exists under `native/agentsam-machine`, with portable resolution/install logic in `src/commands/machine-binary.js` and `src/commands/machine-runtime.js`.
- Ollama is the only meaningful local model integration today. `src/commands/ollama.js` supports local setup/status/list/pull and `/api/tags` plus `/api/show` probing. `src/providers/ollama-chat.js` supports chat, tool calls, usage events, continuation state, and compaction.
- Model discovery and credential-scoped inventory already exist in `src/models/inventory-core.js`, `src/models/discovery.js`, `src/indexing/ingest/discover-models.js`, and `src/commands/models.js`.
- Existing provider adapters and telemetry/receipt primitives can be reused rather than creating a second model-router stack.
- The test layout already separates deterministic release-blocking suites from live-daemon tests, which is the correct pattern for local engines.

### Missing or incomplete capabilities

- No `agentsam.local-engine.v1` schema, TypeScript/JavaScript contract, registry, or capability negotiation layer exists.
- No unified `discover()`, `capabilities()`, `chat()`, `embed()`, and `unload()` interface spans Ollama, MLX-LM, and llama.cpp.
- MLX-LM and llama.cpp/`llama-server` discovery and adapters are absent.
- Current Ollama support is a provider-specific command/adapter, not an engine implementation behind a capability-driven router.
- No deterministic Apple hardware audit covers chip family, core counts, unified memory, Metal feature set, or OS/toolchain evidence.
- No benchmark protocol or persistence format exists for TTFT, tokens/sec, VRAM/unified-memory use, repeatability, or structured-output validity.
- No GBNF/JSON validity evaluator exists, and the current Ollama adapter does not expose streaming timestamps required for TTFT.
- No storage auditor inventories `~/.agentsam` model assets, detects duplicate weights, or records references/links without copying model files.
- The current `~/.agentsam` convention is not yet centralized for all future engine/model paths; the new layer should use an injected home/root resolver and `AGENTSAM_HOME`, not scattered `os.homedir()` calls.
- Engine-specific routing is not yet capability-driven. Existing model inventory/provider code should remain compatible, but local engine selection needs to move behind an engine registry and normalized capability cards.

## 2. Current repository map and authorities

| Concern | Current authority | Reuse in the build |
|---|---|---|
| Public SDK exports | `src/index.js`, package `exports` | Add stable local-engine exports only after contract tests |
| CLI dispatch/help | `src/cli.js`, `src/cli/command-catalog.js` | Add `engine`/`benchmark` commands without changing existing `ollama` behavior abruptly |
| Local Ollama setup | `src/commands/ollama.js` | Refactor into an Ollama engine adapter while retaining compatibility wrapper |
| Ollama chat/tools | `src/providers/ollama-chat.js` | Adapt to normalized chat stream/result and structured-output evidence |
| Local model catalog | `src/models/catalog.js`, `src/models/index.js` | Keep hosted catalog separate; add runtime-discovered local records |
| Provider/model discovery | `src/models/inventory-core.js`, `src/models/discovery.js` | Extend with local engine inventory, never expose credentials |
| Machine identity | `src/lib/terminal/machine-identity.js` | Base platform/arch identity; add Apple-specific read-only probes |
| Managed user runtime | `src/commands/machine-runtime.js` | Follow its `AGENTSAM_HOME` and versioned runtime pattern |
| Deterministic capabilities | `src/capabilities/` and capability manifest | Register local audit/benchmark capabilities with schemas and receipts |
| Receipts/usage | `src/telemetry/`, runtime SQLite/migrations | Persist benchmark metadata/results, not raw prompts or weight data by default |
| Tests | `test/`, `test/cli/`, `test/integration/`, `test/terminal/` | Add pure fakes and explicit opt-in live Apple/engine tiers |
| Protocol schemas | `protocol/` | Add versioned JSON schemas and validate them in tests/verification |

## 3. Target architecture

```text
CLI / SDK
  └─ LocalEngineRegistry
       ├─ AppleComputeAudit (read-only host facts)
       ├─ Engine adapters
       │    ├─ OllamaEngine
       │    ├─ MlxLmEngine
       │    └─ LlamaCppEngine
       ├─ CapabilityNegotiator / policy
       ├─ EngineRouter (capabilities, not engine names)
       ├─ BenchmarkRunner
       │    ├─ timing + token accounting
       │    ├─ resource sampler
       │    └─ JSON/GBNF validator
       └─ AssetGovernance
            ├─ ~/.agentsam/models manifest
            ├─ path/link/reference inventory
            └─ duplicate-weight detector
```

### Non-negotiable boundaries

1. **Read-only audit:** inventory probes may execute bounded version/info commands and read system APIs, but must not install, start, stop, unload, mutate model files, or transmit prompts.
2. **User-space ownership:** managed binaries, manifests, logs, and optional caches live below `${AGENTSAM_HOME:-$HOME/.agentsam}`. Large weights remain where the engine already owns them; record canonical paths, inode/file IDs where available, symlink/clone relationships, and hashes only when explicitly requested.
3. **Capability-first routing:** routers ask for capabilities such as `chat.streaming`, `chat.tools`, `output.json_schema`, `embedding`, `model.unload`, `metrics.memory`, and `format.gguf`; they do not branch on `provider === 'mlx'` in core execution code.
4. **No implicit network:** local-engine discovery and benchmark commands default to loopback/local process probes. Any remote endpoint requires explicit configuration and is marked non-local in receipts.
5. **Truthful unknowns:** unsupported metrics are `null` with an evidence/status reason, never guessed. Apple unified memory is not mislabeled as discrete VRAM.
6. **Safe process control:** argv arrays, bounded timeouts, process-group cleanup, no shell interpolation, redacted errors, and explicit approval for launch/pull/unload actions.

## 4. Contract proposal: `agentsam.local-engine.v1`

Add:

- `protocol/local-engine/engine.v1.schema.json`
- `protocol/local-engine/capability-card.v1.schema.json`
- `protocol/local-engine/chat-result.v1.schema.json`
- `protocol/local-engine/embed-result.v1.schema.json`
- `protocol/local-engine/inventory.v1.schema.json`
- `src/local-engine/contracts.js`
- `src/local-engine/registry.js`
- `src/local-engine/errors.js`

The JS contract should be dependency-light and usable from Node hosts; adapters can use Node process APIs behind the host boundary.

```js
const engine = {
  id: 'ollama',
  version: '...',
  discover: async ({ signal }) => inventory,
  capabilities: async ({ model, signal }) => capabilityCard,
  chat: async ({ model, messages, tools, responseFormat, stream, signal, onEvent }) => chatResult,
  embed: async ({ model, inputs, signal }) => embedResult,
  unload: async ({ model, signal }) => unloadResult,
};
```

Every result includes `schema_version`, `engine_id`, `model`, `status`, `evidence`, and normalized error information. Capability cards should describe support and evidence, for example:

- `chat`, `chat.streaming`, `chat.tools`
- `embed`, `embed.batch`
- `output.json`, `output.json_schema`, `output.grammar`
- `model.unload`, `model.load`
- `metrics.ttft`, `metrics.tokens_per_second`, `metrics.memory`
- `format.gguf`, `format.safetensors`, `runtime.metal`, `runtime.mlx`

The contract must distinguish `supported`, `unsupported`, `unknown`, and `available_now`; an engine can support JSON schema in principle while a selected model/backend does not.

## 5. Hardware and engine inventory implementation

### 5.1 Cross-platform host audit

The compute audit is universal. Apple Silicon is a high-value specialization, not the host assumption. Implement platform modules behind one `auditHost()` dispatcher with injectable command/filesystem readers:

- **macOS:** Apple Silicon, unified memory, Metal, system profiler, and MLX evidence.
- **Linux:** distribution/kernel, CPU topology, system memory, NVIDIA/AMD accelerator discovery when vendor tools are present, and shell/runtime inventory.
- **Windows:** PowerShell or `pwsh`, WMI/CIM hardware facts, GPU controller discovery, system memory, and shell/runtime inventory.
- **Other platforms:** return normalized host identity and explicit unavailable fields; never emulate Apple/VRAM facts.

All platform implementations must report `vram_bytes: null` unless a vendor/API probe provides a defensible value. PowerShell, Bash, Zsh, and POSIX shell availability are inventory facts, not engine assumptions.

### 5.2 Apple Silicon audit

Implement the macOS specialization with injectable command/filesystem readers. On macOS, collect only available facts using bounded probes:

- `uname`/Node OS facts: platform, kernel, architecture, Rosetta indicators.
- `sysctl`: `hw.model`, `hw.memsize`, CPU brand/core counts where available.
- `system_profiler SPHardwareDataType SPDisplaysDataType`: chip/GPU and display/Metal-adjacent evidence, parsed defensively.
- `ioreg` or supported system APIs only when needed and documented.
- Metal capability probe as a small signed/managed helper or native Machine extension, not an unbounded shell scrape.

Normalize to `chip_family`, `chip_generation`, `gpu_cores`, `performance_cores`, `efficiency_cores`, `unified_memory_bytes`, `metal_features`, and `evidence[]`. Mark memory as `unified_memory`, with `vram_bytes: null` unless a platform-specific measurement is genuinely available.

### 5.2 Engine discovery

Each adapter gets a read-only `discover()` implementation:

- **Ollama:** binary/version, configured endpoint, `/api/version`, `/api/tags`, per-model `/api/show`; preserve current local-only endpoint semantics.
- **MLX-LM:** discover managed binary/module and PATH commands, version, model roots, server/listen endpoint if running, and whether Metal/MLX is importable. Do not assume a Python environment or install dependencies during discovery.
- **llama.cpp:** discover `llama-server`/`llama-cli`, version/help feature evidence, running server health, model path(s), GGUF metadata where readable. Keep command names configurable because package managers vary.

Discovery output must include `installed`, `reachable`, `version`, `models`, `capabilities`, `source`, `paths` (redacted/portable as appropriate), and `warnings`.

## 6. Benchmark harness: `agentsam.engine.benchmark.v1`

Add a separate harness, not a hidden side effect of chat routing:

- `src/local-engine/benchmark/runner.js`
- `src/local-engine/benchmark/timing.js`
- `src/local-engine/benchmark/resources.js`
- `src/local-engine/benchmark/structured-output.js`
- `protocol/local-engine/benchmark.v1.schema.json`
- CLI: `agentsam engine benchmark <engine|all> [--model ...] [--json]`

### Measurement rules

- Warmup runs are separate from measured runs and reported.
- Use a monotonic clock. TTFT is request-send to first non-empty model token/event; tokens/sec uses generated tokens and excludes setup time, with an explicit fallback when token counts are unavailable.
- Capture load time separately from generation time.
- Resource sampling is engine/platform-specific. On Apple Silicon, report unified-memory current/peak if measurable and `unknown` otherwise; do not call it VRAM without evidence.
- Capture engine/model revision, prompt fixture ID/hash, options, temperature/seed, run count, OS/hardware audit reference, and timestamp.
- Never persist full prompts or generated output by default. Store fixture IDs/hashes and validation summaries; allow an explicit `--include-output` diagnostic mode with redaction policy.
- Repeatability requires fixed seed/options where supported, isolated model state where possible, and a declared warm/cold mode.

### Structured-output validity

Provide canonical fixtures for:

1. plain JSON object,
2. nested JSON with arrays and optional values,
3. AgentSam tool-call envelope,
4. invalid/truncated output.

Validate with JSON parsing plus JSON Schema (and grammar/GBNF enforcement evidence where the engine supports it). Report `valid`, `parse_error`, `schema_error`, `grammar_enforced`, and `tool_arguments_valid`. Do not infer GBNF enforcement from valid output alone.

## 7. Cache and storage governance

Create a user-space asset manifest, for example `${AGENTSAM_HOME}/models/manifest.v1.json`, containing model identity, engine ownership, source URI/provider, revision/digest, format, size, canonical path, link/reference type, and last-seen timestamp.

Governance operations:

- `agentsam engine assets audit [--json]` — read-only inventory.
- `agentsam engine assets adopt <path>` — record an existing asset; never copy by default.
- `agentsam engine assets verify` — check existence/size/digest according to policy.
- `agentsam engine assets gc --plan` — produce a deletion plan only; deletion requires explicit confirmation.

Default search roots are engine-reported and user-configurable, not hardcoded host paths. Use `AGENTSAM_HOME`, XDG conventions where applicable, and engine APIs. Deduplication should prefer references/symlinks/engine-native stores; never duplicate multi-GB weight files merely to make them “managed.”

Security requirements: do not follow symlinks outside an approved root without explicit opt-in, avoid reading credential files, redact home paths in portable receipts unless `--verbose`, and hash incrementally with a bounded resource policy.

## 8. Router and model integration plan

1. Introduce `LocalEngineRegistry` and register Ollama first behind the new interface.
2. Add a normalized local model record source to inventory; preserve current hosted `MODEL_CATALOG` semantics.
3. Update model selection to filter by capability cards (`chat`, `embed`, tools, structured output, context limits), not engine-specific conditionals.
4. Adapt `createOllamaChatAdapter` to implement the contract and preserve current telemetry/provider-state behavior.
5. Add MLX-LM and llama.cpp adapters only after contract tests and subprocess safety utilities exist.
6. Make the agent runner accept an engine-resolved adapter through dependency injection. Core routers must not import MLX, llama.cpp, or Ollama modules.
7. Keep `agentsam ollama` as a compatibility command; add `agentsam engine status`, `agentsam engine audit`, and `agentsam engine benchmark` as the universal surface.

## 9. Delivery sequence

### Phase 0 — Contract and safety foundation

- Freeze schemas, error vocabulary, capability identifiers, home/path resolver, subprocess runner, redaction rules.
- Add schema fixtures and registry tests.
- Add an architecture guard that rejects absolute operator paths and engine imports from core routers.

### Phase 1 — Inventory MVP

- Apple audit with mocked command fixtures and a real macOS smoke test that skips off macOS.
- Ollama adapter discovery migrated from existing code.
- `agentsam engine audit --json` with honest unavailable/unknown states.
- Asset manifest read-only audit.

### Phase 2 — Unified Ollama execution

- Contract-backed chat/embed/unload behavior.
- Streaming event timestamps and normalized usage.
- JSON/tool-schema validation fixtures.
- Router injection and compatibility tests.

### Phase 3 — MLX-LM and llama.cpp

- Read-only discovery first, then chat/embed adapters.
- Explicit format/model capability negotiation.
- Process lifecycle, unload, crash diagnostics, and model path governance.

### Phase 4 — Benchmarks and receipts

- Warm/cold benchmark runner, resource samplers, structured-output suite.
- Versioned benchmark receipts and comparison command.
- Opt-in live tests on Apple Silicon and installed daemons; never release-blocking.

### Phase 5 — Graduation and packaging

- Pack/clean-room consumer tests verify exports and CLI behavior.
- Full release gate: unit, CLI, mocked integration, terminal mock, workspaces, package/boundary/bootstrap/security checks.
- Document supported combinations truthfully; unsupported hosts/engines remain discoverable as unavailable, not silently emulated.

## 10. Test matrix and acceptance criteria

### Release-blocking deterministic tests

- contract/schema normalization and capability negotiation
- Apple parser fixtures for M1/M2/M3/M4 and non-Apple hosts
- subprocess argv, timeout, signal, redaction, and path portability
- fake Ollama/MLX/llama.cpp servers and process adapters
- chat/embed/unload lifecycle and error mapping
- JSON Schema/tool argument/GBNF evidence evaluation
- benchmark math using deterministic clocks and token/resource samples
- asset governance: no-copy adoption, duplicate detection, symlink boundaries, manifest migration
- CLI JSON/text snapshots and packed export checks

### Explicit live tests

- macOS Apple Silicon hardware audit
- installed MLX-LM, `llama-server`, and Ollama discovery
- actual model generation/embedding and unload behavior
- memory sampling and Metal capability helper
- benchmark execution against user-selected models

### Definition of done

- All new public schemas, exports, docs, CLI entries, and tests agree.
- `npm test` and the affected workspace/release gates pass without a local daemon or Apple host.
- Live engine tests are opt-in, clearly labeled, and skipped with an honest reason when unavailable.
- No absolute operator paths, credentials, model weights, or machine-specific assumptions enter source, fixtures, or shipped receipts.
- Core routers consume capability cards and injected engine adapters, with no hardcoded engine-specific branching.
- A clean-room packed install can run discovery/status without this monorepo, private paths, or pre-existing model files.

## 11. Recommended first implementation slice

The safest first PR should be **Phase 0 + Phase 1**, limited to:

1. versioned local-engine and inventory schemas;
2. `LocalEngineRegistry` plus a fake engine;
3. portable `AGENTSAM_HOME`/asset manifest utilities;
4. Apple audit parser with fixtures and non-macOS skip behavior;
5. Ollama discovery adapter wrapping current probes;
6. `agentsam engine audit --json` and focused tests;
7. this plan plus protocol README and support matrix.

Do not begin by installing MLX, downloading model weights, or changing the model router. Establish the contract and evidence model first; then each engine can be added without weakening portability or the release gate.
