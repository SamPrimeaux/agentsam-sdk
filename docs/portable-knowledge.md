# Portable repository knowledge

This is the first runnable package slice: existing-repository setup, JS/TS AST extraction, text retrieval, optional Gemini Embedding 2, local SQLite or backend Postgres/pgvector, and retained observations. The host application can call the same exported engine. No IAM account or product-specific directory layout is required.

## Start with a small scope

```sh
agentsam init . --yes --include src/lib,docs --scope foundation
agentsam index plan
agentsam index run
agentsam search "snapshot integrity"
agentsam index show
```

Bare `agentsam init` detects an existing Git repository and offers a setup wizard. `agentsam init --name new-project` retains the scaffold workflow. Setup creates `.agentsam/knowledge.json` exclusively and preserves existing source/configuration. The config's `repository_id` is generated once; workspace identity is explicit, never inferred from a Git owner. Commit this non-secret config to share identity across checkouts. Use a distinct repository ID when cloning it for another customer.

Scope entries are literal relative files/directories, comma-separated on the CLI, not glob expressions. Supported AST languages are JS/JSX/TS/TSX including `.mjs`, `.cjs`, `.mts`, `.cts`; Markdown/MDX, SQL and JSON are bounded text chunks, not AST parsers. Imports, re-exports and call expressions are syntactic observations marked `resolved: false`, not a type-resolved cross-file call graph. Syntax errors abort publication.

The source inventory respects Git's untracked-file ignores; tracked files remain visible. Generated directories, `.agentsam`, dependency trees, common environment files and lockfiles are excluded. Symlinks, binary/invalid UTF-8 and files over 2 MiB are skipped and reported. Review include/exclude paths before uploading content; filename exclusions are not a secret scanner.

## Optional embeddings

```sh
agentsam index plan --embed
# Supply GEMINI_API_KEY through your environment/secret manager.
agentsam index run --embed --max-inputs 100 --max-characters 200000
agentsam search "where are snapshots published atomically?" --semantic
```

The default profile is Gemini Embedding 2, 768 dimensions and code retrieval. Edit `embedding` in the config to change provider/model/revision/dimensions/parameters. The included provider supports `gemini-embedding-2`; other providers are injected through the library's `embedder` port. Unsupported parameters fail instead of being silently ignored. Use `revision` to invalidate a cache when a provider changes an alias or your adapter changes input semantics.

Gemini Embedding 2 uses query/document text prefixes and `outputDimensionality`; it does not accept Embedding 1's `taskType`. Each content chunk gets a separate request. Retries are bounded to three attempts with exponential jitter, per-request timeout and transient status handling. See [Google's embedding documentation](https://ai.google.dev/gemini-api/docs/embeddings).

Limits count unique uncached inputs and content characters, not total billable attempts/tokens. A request can be retried; character-based token estimates are planning aids, not billing measurements. The CLI sends no provider traffic without `--embed` or `--semantic`. A fully cached embedding run needs no API key. Search costs one query embedding in semantic mode.

## Incremental and history guarantees

- Structural parse cache keys include source content, language, parser version and chunking policy.
- Vector keys include workspace/repository namespace, model, revision, dimensions, parameters, input-format version and actual chunk content. Paths/commit IDs are retrieval metadata, so a pure move reuses vectors.
- Scope expansion rechecks the complete selected inventory. Named scopes have separate active generations. Different customers/repositories do not share caches.
- An unchanged run performs zero embedding requests. An edit embeds only changed chunks; changing the profile creates a separate embedding space.
- A run stages completed cache work, rechecks source hashes, then atomically publishes a generation with compare-and-swap protection. Provider failure, invalid dimensions, concurrent publication or mid-run source edits leave the previous active generation intact.
- Old generations retain content and graph observations. Deletion removes a file from current retrieval without deleting it from history. `index history`, `index show --generation ID` and `search "query" --generation ID` inspect past knowledge explicitly.

`index run` without `--embed` publishes an AST/text generation, including when the previous generation was embedded. Semantic search then requires a new `--embed` run (which can reuse existing vectors). Search reports its snapshot identity and says that working-tree freshness was not checked; it never claims live-code authority.

## Evolution observations

```sh
agentsam repo snapshot --churn-days 7 --save
# Run again after work, or from your own morning/night scheduler.
agentsam repo snapshot --churn-days 7 --save
agentsam repo compare
agentsam repo history
```

This wraps the existing bundled Python repository-intelligence module (Python 3.10+). It retains timestamped Git identity, file/LOC composition, directory counts, hotspots, rolling churn and the score definitions. `compare` compares the last two observations' raw counts. It does not label normalized heuristic changes as quality, or rolling churn as a measured percentage of rework. Runtime latency, deployment status, billing and agent success rates need host telemetry adapters; these commands do not invent those facts or send reports.

## Backend Postgres / Supabase

```sh
agentsam init . --yes --include backend/feature --target production --workspace customer-workspace
# Supply AGENTSAM_DATABASE_URL through a secret manager.
agentsam index setup-store
agentsam index plan
agentsam index run
```

Production selects the storage destination; execution still runs from this checkout. Review [`postgres.sql`](../src/knowledge/stores/postgres.sql) before `setup-store`, which explicitly applies it to the configured database. Init/plan/search never migrate a database. Use a dedicated backend connection with TLS appropriate to your environment. The private `agentsam_knowledge` schema is not intended for browser access or Supabase's exposed REST schemas; tenant authorization belongs in the host. Workspace-qualified IDs provide isolation in queries, not authentication.

SQLite stores cache entries plus immutable generation/observation payloads locally under `.agentsam/knowledge/`, excluded from Git. Postgres stores the same versioned facts in JSONB and embeddings in native pgvector, with exact cosine ranking restricted to the selected generation's vector keys. This first slice uses exact search, not an ANN index; large indexes need per-profile partitions/indexes and benchmarks. The unconstrained vector column permits multiple dimensional profiles, but queries never mix them. Retention/garbage collection is intentionally absent so initial history is preserved; configure a retention policy before large production backfills.

Supabase Postgres is useful when facts, metadata, history and embeddings need transactional consistency and SQL joins. Cloudflare Vectorize would be a vector-retrieval adapter alongside a separate structural/history store. It does not replace the AST graph/history database. No Vectorize adapter is claimed in this release. See [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector) and [pgvector](https://github.com/pgvector/pgvector).

## Embed in another application

```js
import { defaultConfig, openSqliteStore, runIndex, retrieve }
  from '@inneranimalmedia/agentsam-sdk/knowledge';

const config = defaultConfig({ include: ['lib'] }); // persist once; do not regenerate per run
const store = await openSqliteStore('/absolute/customer-repo/.agentsam/knowledge/index.sqlite');
try {
  await runIndex({ root: '/absolute/customer-repo', config, store });
  const context = await retrieve({ config, store, text: 'validation' });
  console.log(context.hits);
} finally { await store.close(); }
```

Store ports implement `active`, `getGeneration`, `cacheGet`, `cachePut`, `publish`, `history`, `observe`, `observations`, and `close`; `rankVectors` is optional. `publish(generation, expectedId)` must atomically compare the active generation and replace it. Embedding adapters implement `embed(text, profile, {kind})`, returning a vector; optional `validate(profile)` rejects unsupported settings before work begins. Do not reuse a profile ID across adapters with different input formatting.

The recovered `KnowledgeClient`, JSON schemas and Python client describe remote transports. The direct engine returns compatible retrieval context packs; index planning/run receipts are local operational records, not remote `IngestReceipt` objects. Original branch provenance and deferred ideas are recorded in [knowledge-branch-recovery.md](./knowledge-branch-recovery.md).

## Verification

`npm run verify` exercises existing SDK behavior, incremental invariants, local generation isolation, Gemini wire format/retry behavior, actual Postgres/pgvector SQL through PGlite, and package contents. `npm run verify:knowledge-package` installs a packed tarball into an unrelated temporary consumer and runs the installed CLI on two independent repositories. Provider tests use deterministic fixtures; they do not establish live Gemini quality, billing, or a production Supabase deployment.
