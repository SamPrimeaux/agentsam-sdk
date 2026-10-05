# AgentSam Rapid Rust / Wasm

`agentsam rust` and `agentsam-rapid-rust` provide one native Rust CLI for scaffolding and locally proving Cloudflare Rust/Wasm workers.

## Templates

- `api` — compact JSON/health Worker
- `shared-core` — Cargo workspace with pure `core/` crate + Cloudflare `worker/` adapter
- `crypto-auth` — constant-time HMAC-SHA256 request verification
- `data-processor` — typed JSON batch transform

## Local-first

```bash
python3 scripts/build_rapid_rust_cli.py --bootstrap --build --install --smoke
agentsam rust doctor
agentsam rust new my-edge-api --template api --explain
cd my-edge-api
agentsam rust check
agentsam rust build
agentsam rust dev
```

`new`, `doctor`, `check`, and `build` do not deploy. Live deployment is intentionally separate:

```bash
agentsam rust deploy --dry-run
agentsam rust deploy --yes
```

Rust Workers compile to `wasm32-unknown-unknown`; dependencies must be Wasm-compatible. Use a normal native process/Container only when the workload actually needs that process model. Do not infer “Go/Rust service = Docker/Container required.”

## What the current proof means

A successful scaffold/check/build/Wrangler dry-run is **Level 1 proof**:

```text
scaffold validity
→ Rust/Wasm compilation
→ worker-build packaging
→ Wrangler deployment packaging
```

That proves the generated architecture is real enough to compile and package. It does **not** prove production correctness, load behavior, operational reliability, security, or that Rust is better than an existing Go/Node/TypeScript implementation.

Do not use “published” or “dry-run passed” as a substitute for runtime acceptance.

## Validation ladder

Rapid Rust should graduate templates through increasingly real proof:

```text
L1  scaffold/check/build/dry-run
L2  functional request/response behavior
L3  adversarial/property/fuzz tests
L4  real Cloudflare bindings and remote smoke
L5  benchmark against equivalent existing implementation
L6  production dogfood with telemetry/rollback/receipts
```

Measurements should include what actually matters for the workload: correctness, latency, CPU, memory, startup, binary/bundle size, reconnect/recovery, dependency footprint, and developer/operational complexity.

## Dogfood rule

Prefer a real AgentSam subsystem over a fifth toy template.

The strongest first candidate is the `shared-core` pattern:

```text
pure Rust core
    │
    ├── Cloudflare Worker/Wasm adapter
    ├── native macOS/Linux/Windows host
    ├── CLI/Tauri/native consumer
    └── tests/canaries
```

Useful real domains include:

- runtime target/connection normalization;
- capability/state-machine validation;
- session/auth/crypto policy;
- receipt parsing/normalization;
- deterministic data transforms.

For ExecOS/`agentsamd`, language must not change architectural ownership:

```text
agentsamd = machine-runtime role
ExecOS    = remote routing/resolution role
Rust/Go/Node = implementation choices
```

The runtime-unification lane must compare current implementations before replacing anything. See `docs/plans/AGENTSAMD-RUNTIME-UNIFICATION.md`.

A good Rust experiment is a canary or shared core behind the same `agentsam.runtime.v1` fixtures, not an automatic rewrite of working PTY/runtime machinery.

## Wasm strip rule

Generated Workers use `strip = "debuginfo"`, not `strip = true`. Current wasm-bindgen catch-wrapper generation needs the externref table that full symbol stripping can remove.
