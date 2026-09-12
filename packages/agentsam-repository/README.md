# @inneranimalmedia/agentsam-repository

Owned repository/runtime package for AgentSam.

It owns deterministic repository identity and Merkle behavior that must be reusable independently of the CLI surface:

- Git remote/context normalization
- Merkle content trees and snapshots
- semantic/file metadata classification
- Merkle persistence contracts and Cloudflare binding adapters
- repository graph runtime normalization

It does **not** own authenticated account sessions, CLI commands, UI rendering, knowledge retrieval, deployment orchestration, or product application state. Those layers consume this package through explicit imports.

The workspace is private while the extraction stabilizes. Cross-repository consumers should continue using the published `@inneranimalmedia/agentsam-sdk` facade until this package receives its own release policy.
