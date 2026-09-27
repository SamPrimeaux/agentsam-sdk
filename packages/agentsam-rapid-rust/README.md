# @inneranimalmedia/agentsam-rapid-rust

Native Rust CLI source for `agentsam rust` / `agentsam-rapid-rust`.

It scaffolds Cloudflare `workers-rs` projects, performs local Wasm checks/builds, runs Wrangler locally, and gates live deployment behind an explicit `--yes`. Compiled binaries are not committed; use `scripts/build_rapid_rust_cli.py` to build/install one.
