# agentsam-machine-cli

Command-line interface for AgentSam's deterministic native repository perception
engine.

Installing this crate from crates.io provides the `agentsam-machine` executable
without requiring an AgentSam SDK source checkout:

    cargo install agentsam-machine-cli
    agentsam-machine --help

Cargo installs binaries into `$CARGO_HOME/bin` (normally `~/.cargo/bin`).
The standard Rust installer configures that directory on PATH. If you use a
custom `cargo install --root <dir>`, add `<dir>/bin` to PATH yourself.

The published CLI depends on the published `agentsam-machine-core` crate by
version. The monorepo's local `path = "../core"` entry is only a development
override; registry consumers resolve `agentsam-machine-core` from crates.io.

The CLI is model-free. It delegates inspection and asset analysis to
agentsam-machine-core.
