# AgentSam file metadata format, version 1

`agentsam-filemeta` is a deterministic semantic companion to the content-only `agentsam-merkle` protocol. It does **not** replace or extend the content Merkle root. A repository can therefore have the same `merkle_root` and a different `metadata_root` when permissions, classification rules, package metadata, or parser metadata change without changing file bytes or relative paths.

## Envelope

```json
{
  "format": "agentsam-filemeta",
  "version": 1,
  "algorithm": "sha256",
  "classifier": {
    "format": "agentsam-filemeta",
    "version": 1,
    "source": "path+package+ast",
    "ast_parser": "typescript",
    "ast_parser_version": "5.9.3"
  },
  "rootHash": "sha256:...",
  "stats": {},
  "entries": []
}
```

`rootHash` is SHA-256 over the canonical semantic envelope payload using the domain prefix `agentsam-filemeta:root:v1\0`. Object keys are recursively sorted; entry order is sorted by unsigned UTF-8 bytes of `path`. The hashed payload contains `classifier` plus the full semantic `entries` array. Summary `stats` are intentionally outside the metadata root.

## File records

Semantic entries correspond one-for-one with non-directory content entries and retain their content linkage:

```json
{
  "path": "packages/identity/src/core/accounts.js",
  "type": "file",
  "size": 213,
  "mode": 420,
  "hash": "sha256:...",
  "package": "@inneranimalmedia/agentsam-sdk-identity",
  "package_root": "packages/identity",
  "package_kind": "library",
  "system": "identity",
  "category": "accounts",
  "layer": "core",
  "kind": "source",
  "language": "javascript",
  "role": "business-logic",
  "tags": ["account-scoped", "authentication"],
  "symbols": ["accountLinkingNotConfigured"],
  "imports": [],
  "ast": {
    "indexed": true,
    "parser": "typescript",
    "symbol_count": 1,
    "dependency_count": 0,
    "parse_error_count": 0
  }
}
```

`hash` is the content Merkle entry hash and `size` must match the linked content entry. `mode` is the observed Unix permission bits in decimal. Semantic metadata is derived by convention from repository/package paths, nearest `package.json` metadata, and syntax parsing. JavaScript/TypeScript-family source files up to the implementation size limit receive AST symbol/import metadata.

## Package overrides

A package may declare stable package-level semantics without tagging every file:

```json
{
  "name": "@inneranimalmedia/agentsam-sdk-identity",
  "agentsam": {
    "system": "identity",
    "kind": "library",
    "tags": ["authentication", "account-scoped"],
    "classify": [
      { "glob": "src/core/**", "role": "business-logic" }
    ]
  }
}
```

Convention remains the default. `agentsam.classify` is an optional deterministic override layer for exceptional package layouts.

## Identity boundary

The two roots answer different questions:

- `agentsam-merkle` `rootHash`: did included relative names, file bytes, or literal symlink targets change?
- `agentsam-filemeta` `rootHash`: did the semantic/index view of those content entries change?

A classifier or parser upgrade may change only the metadata root. A permission-only change may change only the metadata root. A file-byte change normally changes both.
