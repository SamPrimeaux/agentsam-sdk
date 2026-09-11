# Graphs, Contracts, AST, and Merkle Evidence

## The codebase is a graph

A large application is easier to reason about when you stop treating it as a folder
maze and start treating it as a graph:

```text
files -> symbols -> imports/calls -> packages -> services -> external destinations
```

The graph answers questions humans should not have to remember:

- If package C changes, which apps depend on it?
- Which browser entrypoints can reach this server-only module?
- Which route consumes this schema?
- Which service owns a database write?
- Which packages can build/test in parallel?
- Which consumers must be revalidated after a contract change?

A DAG is especially useful for build/test ordering when cycles are absent or have been
made explicit.

## AST is structure, not text coincidence

An Abstract Syntax Tree is the parsed structural representation of source code. It can
reliably distinguish function declarations, imports, calls, environment accesses,
and other syntax that a plain text search can only approximate.

AgentSam should use AST evidence to derive dependency and execution-boundary facts,
then preserve parser coverage/errors so an agent knows where certainty ends.

Useful AST-derived facts include:

- imports/exports and resolved local edges;
- symbol declarations and references;
- server/runtime-only dependency use;
- environment variable access names (never secret values);
- browser-reachable versus server-owned code;
- contract/schema ownership hints.

## Contracts make coupling explicit

For a frontend/backend or service/service boundary, prefer one canonical contract
source. Depending on the system that can be a TypeScript package, runtime schema,
OpenAPI document, GraphQL schema, Protobuf definition, event schema, or equivalent.

Compile-time types catch code drift before build. Runtime validation catches real data
that violates the contract after types have been erased or when the caller is outside
the type system. Contract tests can prove independent producer/consumer systems still
agree.

## Merkle is the evidence identity layer

Merkle hashing gives a deterministic identity to a captured file tree. If one included
file changes, the root changes. This makes before/after receipts cheap to compare and
lets CI/deploy systems cache or target work by content identity.

AgentSam separates two identities:

```text
content root
  observed included bytes/paths

semantic metadata root
  classified/indexed meaning derived from those bytes
```

The semantic root can change after a classifier/parser upgrade or execution-domain
classification change even when source bytes remain identical. That distinction is
important: source identity and interpretation identity answer different questions.

## The repair proof loop

For structural repairs, prefer:

```text
snapshot A
  -> contradiction finding + evidence refs
  -> isolated bounded repair
  -> build/type/test/security checks
  -> snapshot B
  -> prove target contradiction disappeared
  -> prove no disallowed new contradictions
  -> emit receipt
```

The model may propose the repair, but deterministic evidence should decide whether the
repair actually satisfied the invariant.
