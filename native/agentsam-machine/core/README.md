# agentsam-machine-core

Deterministic repository and asset inspection primitives used by AgentSam's native
agentsam-machine CLI.

The crate is model-free and provider-free. It turns repository files and assets
into bounded machine-readable facts used by higher-level AgentSam tooling.

## Source-type contract

The published crate includes a vendored copy of agentsam.source-types.v1 so it
can compile independently from the AgentSam monorepo. While built inside the
monorepo, build.rs verifies that vendored copy is byte-for-byte identical to
the root contracts/source-types.v1.json authority.
