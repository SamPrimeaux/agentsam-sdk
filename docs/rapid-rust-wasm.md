# AgentSam Rapid Rust / Wasm

`agentsam rust` and `agentsam-rapid-rust` provide one native Rust CLI for scaffolding and locally proving Cloudflare Rust/Wasm workers.

## Templates

- `api` — compact JSON/health Worker
- `shared-core` — real Cargo workspace with pure `core/` crate + Cloudflare `worker/` adapter
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

Rust Workers compile to `wasm32-unknown-unknown`; dependencies must be Wasm-compatible. Use a Cloudflare Container instead when the workload needs a normal Linux process model, threaded runtime, large native toolchain, or long-running heavy jobs.

## Wasm strip rule

Generated Workers use `strip = "debuginfo"`, not `strip = true`. Current wasm-bindgen catch-wrapper generation needs the externref table that full symbol stripping can remove.
