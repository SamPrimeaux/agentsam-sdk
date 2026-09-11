# Repository knowledge provider contract

The SDK does not define the InnerAnimal production code index as the universal implementation.

The npm package defines the portable capability contract. A host chooses how to satisfy it.

```text
Agent Sam repository understanding
              │
      ┌───────┼────────┐
      │       │        │
      ▼       ▼        ▼
   Local    Hosted   Existing
    SDK     AgentSam   system
      │       │        │
 lightweight  full    Sourcegraph /
 local slice platform  Qdrant /
                     custom service
```

## Provider surface

A `RepositoryKnowledgeProvider` supplies:

```text
status()
refresh()
findSymbol()
graph()
retrieve()
snapshot()
```

The SDK intentionally does not prescribe D1 tables, pgvector schemas, parser processes, queues, or embedding providers behind those calls.

```js
import {
  createRepositoryKnowledgeClient,
  describeRepositoryKnowledgeProvider,
} from '@inneranimalmedia/agentsam-sdk/indexing';
```

A provider should describe actual capabilities rather than relying on stale prose metadata:

```js
describeRepositoryKnowledgeProvider({
  provider: 'inneranimal-platform',
  structure: 'tree-sitter',
  lexical: true,
  semantic: true,
  graph: true,
  history: true,
  evidence: 'merkle',
});
```

## User-facing concepts

The terminal/UI should normally present only:

```text
Code map   where things are and how they connect
Search     exact/lexical search + optional semantic search
History    generations, Git evidence, and Merkle checkpoints
```

Parser technology, dimensions, vector tables, queue topology, generation internals, and storage adapters belong under advanced/debug surfaces.

## Local SDK implementation

The current SDK contains a portable/local knowledge slice with deterministic repository intelligence, lightweight JS/TS structural parsing, bounded chunks, local SQLite, optional Postgres/pgvector, optional embeddings, generations, and Merkle evidence.

That is useful as a standalone implementation. It is not presented as the architecture of every Agent Sam host.

## InnerAnimal production implementation

The InnerAnimal platform is a separate host implementation with a broader code-intelligence pipeline: repository/index generations, a dedicated Tree-sitter parsing service, D1 structural nodes/edges, structural-first graph retrieval, semantic projections, and bounded hydration.

That implementation should plug into the provider contract rather than be copied into npm.

The same rule applies to the platform's logical RAG lanes (`code`, `schema`, `memory`, `docs`, `media`, `archive`), generic knowledge ingestion pipeline, and memory/experience systems. Those are specialized host infrastructure behind portable Agent Sam capability contracts.

## Existing/custom systems

A customer does not need to reproduce Agent Sam's internal storage model. They can implement the provider surface around their own system.

Examples:

```text
Sourcegraph
Elasticsearch
Postgres / pgvector
Qdrant
Weaviate
custom Tree-sitter service
homegrown RAG / graph service
```

The common contract lets Agent Sam ask for status, refresh, symbols, graph evidence, retrieval, and snapshots while the implementation remains the customer's authority.

## Evidence lineage

Provider results should carry stable evidence references when possible:

```text
repository_id
index generation
Merkle snapshot_id / root hash
Git revision
path + span
provider receipt
```

That lets context packs select evidence without copying the entire underlying index into the prompt.
