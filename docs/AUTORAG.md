# AgentSam AutoRAG

AutoRAG is the setup and orchestration layer for the existing AgentSam knowledge engine. It discovers a repository, selects a deliberately bounded corpus/lane, records a portable profile in `.agentsam/knowledge.json`, and verifies that profile with a safe probe. It is not a second indexer, a giant company collection, or a credentials store.

## Local quickstart

```bash
agentsam autorag setup
agentsam autorag probe
agentsam index plan
agentsam index run
agentsam search "the symbol or phrase"
```

The default is local SQLite, structural and lexical retrieval, and no embedding request. Docker, Cloudflare, Supabase, a company graph, and a paid provider are all optional.

For a non-interactive code profile:

```bash
agentsam autorag setup --yes --kind code --scope packages,src
```

For documents, choose literal paths rather than embedding a whole checkout by default:

```bash
agentsam autorag setup --yes --kind documents --scope docs,README.md
```

`setup` and `configure` write only `.agentsam/knowledge.json`; they never serialize API keys. Provider credentials resolve from the environment, an authenticated host/vault, or an installed provider connector.

## Providers and backends

`agentsam autorag providers` reports the actual registry. Gemini, OpenAI, Workers AI, Ollama, and deterministic `fixture` adapters share the same embedding contract. An unavailable credential/binding is reported unavailable and fails closed; changing a model string never changes another provider's transport.

`agentsam autorag backends` reports `local_exact`, `postgres_pgvector`, `supabase_pgvector`, and `cloudflare_vectorize`. A nonlocal backend requires an explicit resource; Vectorize additionally requires an explicit binding and index. A lane's provider/model/dimensions/backend/resource combination is explicit, so incompatible vector dimensions cannot silently share a physical index.

Use semantic embeddings deliberately. A normal local setup makes none. A probe refuses paid semantic work unless explicitly enabled:

```bash
agentsam autorag configure --yes --provider fixture --semantic --dimensions 3
agentsam autorag probe --semantic
```

## Probe and evidence

`agentsam autorag probe` limits itself to 25 files, 100 chunks, and one query. It creates a dedicated probe generation, so a failed probe cannot replace the active non-probe generation. Its receipt records scope, profile, backend, Git evidence, Merkle root, counts, and the bounded query result.

For code, planning is structural-first: symbol/path lexical matching and JS/TS AST observations remain primary; semantic vectors supplement them. The engine consumes the repository package's deterministic content Merkle and semantic metadata root. Merkle answers what exact filesystem evidence changed; it does not replace AST/import graphs, repository contracts, dependencies, or retrieval generations.

## Company graph and Docker

A host may supply a company-graph adapter. It classifies intent, chooses candidate repositories through contracts/dependencies, resolves repository-specific lanes, then merges bounded evidence. It does not search every repository or create one company-wide vector collection. Repository-specific intent routes override account routes, which override portable defaults.

`agentsam dockerize --type knowledge_service` remains an optional execution host around the same engine. Normal local setup never starts or requires Docker.

## Troubleshooting

Run `agentsam autorag doctor` for config, Git/Merkle, local store, and selected-provider status. Run `agentsam autorag status` to inspect discovery/config, and `agentsam autorag lanes` to see the configured explicit lane. A provider marked unavailable is a capability result, not a reason to add a secret to project config.
