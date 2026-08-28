# AgentSam SDK ownership protocol

This repository is the canonical home for portable AgentSam SDK code, contracts, CLI tooling, and reusable packages.

Platform repositories may consume the SDK, provide host adapters, or incubate product-specific implementations. They must not maintain mirrored copies of SDK trees as a synchronization strategy.

## Rules

1. **Portable code lands here once.** A reusable capability has one canonical implementation in this repository.
2. **Host-specific code stays with the host.** Product bindings, credentials, deployment wiring, and runtime-only policy remain in the consuming application and connect through explicit adapters or ports.
3. **Extract instead of mirror.** When a platform implementation becomes reusable, move the portable contract/core here and replace the host copy with an import, dependency, or adapter.
4. **Contracts travel with the SDK.** Shared schemas and protocol definitions live under `protocol/` and are versioned with the code that consumes them.
5. **No copied package trees.** Do not duplicate `protocol/`, `agentsam_sdk/`, or package source under another path in this repository or another repository merely to keep two homes in sync.
6. **Repository tools observe before they prescribe.** Generic repository intelligence must accept an explicit repo root, be read-only by default, and must not hardcode one repository's folder names, tenant IDs, workspace IDs, providers, or framework layout.

## Layout

```text
agentsam-sdk/
├── src/                       # Node SDK + local/deploy CLI
├── python/agentsam_sdk/       # Python portable tools and TUI
├── packages/                  # Optional focused packages/workspaces
├── protocol/                  # Shared SDK contracts and ownership rules
├── templates/                 # Scaffold templates
├── examples/                  # Runnable examples/pointers
├── docs/                      # Product and developer documentation
└── test/ + python/tests/      # Node and Python verification
```

The root npm identity remains `@inneranimalmedia/agentsam-sdk`. Package boundaries can evolve, but portable code should have one canonical owner and host applications should depend on it rather than mirror it.
