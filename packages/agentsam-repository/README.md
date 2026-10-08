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

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).

## Machine-backed repository crawl and refinery

Rust Machine is the sole filesystem scanner. Repository normalizes its existing
receipts into stable, source-linked resource/edge graphs using the canonical
TypeScript semantic parser. Knowledge accepts this graph as `repositoryCrawl` in
`planIndex` and `runIndex`; it verifies hashes and reuses the inventory.

    agentsam machine crawl /path/to/repository --json
    agentsam machine mine /path/to/repo-a --against /path/to/repo-b --json

Crawl detects package manifests, imports, declarations, configured Worker
bindings, migrations and database tables, and capability declarations.
Worker bindings are **configuration evidence**, not deployed-resource proof.
The snapshot hash excludes runtime timestamps and local absolute paths.

Mine compares exact file hashes, token-normalized hashes and AST signatures.
Candidates retain file hashes, paths, likely package owners, and review steps.
A matching symbol signature is not proof of equivalent behavior. No source
rewrites, promotions, deletes, LLM calls or extra vector databases occur.

The native inspect runtime externalizes reusable evidence under the target's
`.agentsam/machine/runs/`; Git should ignore this runtime output. Knowledge
indexing is an explicit API choice, not a background side effect. Hosted
website crawling and domain-specific CMS promotion remain separate concerns.
