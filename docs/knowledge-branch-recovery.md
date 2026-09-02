# Knowledge branch recovery

Recovered onto current SDK main `485f8cafb3b28bd5bbf442011ed59118744d9ca1`, rather than merging the older tree wholesale.

Source branch: [feat/knowledge-sdk-foundation](https://github.com/SamPrimeaux/agentsam-sdk/tree/feat/knowledge-sdk-foundation).

Source commits:

- [e1911a43](https://github.com/SamPrimeaux/agentsam-sdk/commit/e1911a43a1760ae96cee57ca68f57cc951478e62): cross-language knowledge SDK scaffold.
- [480a1a63](https://github.com/SamPrimeaux/agentsam-sdk/commit/480a1a634af974d96fb11716dc85932d04c47aca): SDK YAML capability manifest.

| Original work | Disposition | Current home / reason |
| --- | --- | --- |
| Eight JSON schemas and protocol README | Recovered | `protocol/knowledge/`; remote transport contracts remain explicit about workspace identity. |
| JS transport client and validation | Recovered | `src/knowledge/client.js`, `contracts.js`; tested with injected transport. |
| Context-pack helper and retrieval planner | Recovered | `context-pack.js`, `retrieval.js`; planner flags describe a requested plan, not implemented reranking. |
| JS knowledge export | Extended | `@inneranimalmedia/agentsam-sdk/knowledge` now also exports the working index engine, stores and provider. |
| Python models, client, package exports | Recovered | `python/agentsam_sdk/knowledge/`; transport client, not a second indexing implementation. |
| Python parser, chunking, indexing, context, ranking, retrieval, sources and evaluation Protocol placeholders | Replaced/deferred | Node engine implements parsing/chunking/indexing/retrieval. Additional parsers, reranking and evaluation suites remain future work; empty classes are not shipped as capabilities. |
| Original JS/Python smoke checks | Expanded | `test/knowledge.test.mjs` and Python knowledge tests cover the recovered behavior plus operational invariants. |
| 274-line `agentsam.yaml` | Retained by immutable commit reference, not restored as authoritative configuration | It mixes implemented/planned capabilities and predates current ownership/package changes. Operational config is `.agentsam/knowledge.json`; supported commands and limits are documented in `portable-knowledge.md`. |
| Old package metadata | Reconciled | Only the knowledge export is carried forward; current main's identity, security, Merkle and package verification remain authoritative. |

No branch was deleted or rewritten. This record distinguishes usable code, superseded implementations, and unimplemented ideas so that refactoring does not silently discard them.

For ongoing work, save `agentsam repo snapshot --save` observations and `agentsam index run` generations. The former retains Git/composition/churn facts; the latter retains selected content, symbols, syntactic dependency observations, source hashes and commit provenance. Search an old generation explicitly to recover removed code without adding it back to current retrieval. These commands capture the checkout being observed; they do not automatically ingest every branch or schedule reports.
