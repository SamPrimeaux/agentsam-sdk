# AgentSam canonical discovery and knowledge first slice

Status: implemented as an incremental SDK feature. Model/provider, standalone
CLI and native host acceptance are separate evidence levels.

## Canonical surfaces

The canonical registry is src/registry/index.js. Its capability.search,
capability.describe, capability.status and capability.invoke tools share the
same query and handler status. tools.search delegates to the same discovery
function; it is not another catalog. The model's first tool schema selection
reserves four bootstrap slots for search/describe/status/invoke, filling remaining
slots with task-specific capability cards from the bound adapter.

capability.invoke is delegated-execution risk, never inherently read-only.
The host must approve the actual invoked operation with its side effects; direct
tools also use the runner's beforeTool approval. Missing native Machine tools
are not advertised as available.

## Bound repository and knowledge operations

| Capability | Implementation | Execution boundary |
| --- | --- | --- |
| project.discover | src/agent/project-discovery.js | Read-only existing npm, Wrangler/Vectorize/D1/R2, knowledge, Python, Rust, MCP signals |
| repository.snapshot | Existing snapshot engine | Runtime-owned project root, bounded churn |
| repository.intelligence | Existing Python deterministic historian | Runtime-owned root, bounded process output/time |
| machine.inspect | Installed Rust Machine | Runtime-owned root; local evidence artifacts, source read-only |
| repository.crawl | Machine evidence -> repository graph | Bounded summary back to model, full graph stays local |
| repository.mine | Machine graphs -> refinery candidates | Second repo explicitly allowed by host |
| knowledge.index | Existing SQLite knowledge engine | Plan/read and approved local index run; no automatic embedding |
| knowledge.search | Existing knowledge retrieval | Configured scope and active generation, top-k/token budgets |
| context.resolve | Existing context budget resolver | Bounded supplied evidence, no arbitrary repository scan |

An unavailable index never launches a rebuild. The knowledge.search status
probe checks whether the current configured scope has an active SQLite
generation. It reports missing or scope-mismatched generations without silently
switching to a historical generation owned by another scope.

## Adaptive first-run behavior

After a user explicitly trusts a project, the existing Clack first-run sequence
can offer read-only recommendations based on the tooling already present.
Declining proceeds directly to AgentSam. Accepting only displays proposed
reuse options, never provisions Vectorize, rewrites Wrangler, selects a provider
or changes deployment target. project.discover provides that read-only evidence
again in later agent turns.

## Verification

Run npm run verify:registry, node --test test/responses-runner.test.mjs,
node --test test/integration/tool-schema.test.mjs and the existing Superbash
scripts tests in src/sam/operation-packs/generated-v2/test/.

The tests cover local SQLite index/search, a deterministic fake model calling
search -> describe -> status -> authorized invoke through the real runner,
denied calls, unauthorized repository escapes, and existing infrastructure
detected without mutation. Native Machine and Python intelligence are also
exercised separately on small real repositories.

## Known limitations

- Existing Cloudflare Vectorize/pgvector pipelines are discovered, not
  automatically adopted without an explicit authorized adapter.
- Native Machine scans may write local evidence artifacts under .agentsam,
  even though they do not modify tracked source files.
- Local Studio hosted/desktop chat parity is NOT proven by the CLI runner tests.
- The optional TUI prompt has a tested detector but not cross-platform
  pseudoterminal interaction coverage.
- Provider API inference is simulated for the runner test; it is not a live
  paid model inference test.
