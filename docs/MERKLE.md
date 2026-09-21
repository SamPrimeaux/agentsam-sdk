# Merkle CLI and interactive explorer

```bash
agentsam merkle root .
agentsam merkle root . --include dist
agentsam merkle snapshot . --semantic --out .agentsam/merkle.json
agentsam merkle verify .agentsam/merkle.json
agentsam merkle diff ./copy-a ./copy-b --interactive
agentsam merkle inspect .
agentsam merkle explore .
```

The commands work on ordinary folders. Git, cloud accounts, databases, and containers are not required. Only `snapshot` writes files. There is no synchronization/restore command or background watcher in this version.

## Commands

| Command | Behavior |
| --- | --- |
| `root [path]` | Computes SHA-256 content identity; defaults to the current directory. |
| `snapshot [path]` | Saves a versioned manifest; defaults to `<path>/.agentsam/merkle.json`. |
| `verify <snapshot>` | Rescans the recorded root and reports unchanged, modified, added, and removed files/links. |
| `diff <a> <b>` | Compares directories, snapshots, or one of each. No files are copied. |
| `inspect [path]` | Prints the full tree/hash breakdown; also accepts a snapshot. |
| `explore [path]` | Opens the keyboard-driven terminal explorer. |

`--semantic` works with root, snapshot, and directory inspection. It adds deterministic `agentsam-filemeta` package/system/category/layer metadata plus JavaScript/TypeScript AST symbols/imports while leaving the v1 content root unchanged. Semantic snapshots validate both roots when reloaded.

`--interactive` works with root, inspect, verify, and diff. Up/down or j/k select an entry; Enter/right expands a directory; left collapses it. `c` filters changes, `r` rescans, and q/Esc/Ctrl+C exits. The explorer uses real scan counts, honors `NO_COLOR`, adapts to terminal resize, wraps the selected hash on narrow screens, and restores cursor/terminal mode on exit. `r` does not update a saved baseline.

With piped output or `TERM=dumb`, the explorer prints once and exits. `--json` always bypasses interactive mode. Root JSON contains `rootPath`, `rootHash`, `policyHash`, `stats`, and `policy`; with `--semantic` it also contains `metadataRoot`, `classifier`, and `semanticStats`; verify/diff JSON contains `equal`, roots, counts, and changed entries.

Exit codes: **0** success/match, **1** differences, **2** invalid input/scan error, **130** interrupted non-interactive scan. Interactive quit after a completed comparison retains its match/difference exit code.

## Comparing machines and preserving baselines

```bash
agentsam merkle verify ./baseline.json --root ./local-copy --interactive
```

Verification uses the saved include/exclude policy. Content roots are independent of absolute paths, timestamps, permissions, and creation order. Permission `mode` may still be recorded as metadata and, when semantic enrichment is enabled, contributes to the separate metadata root.

Snapshots are baselines, not signatures or attestations. Protect a trusted baseline separately. Avoid editing a directory while hashing it; detectable changes/read errors fail the scan, but this is not an atomic filesystem snapshot.

Existing snapshot files are not overwritten without `--force`. Snapshot output is excluded from its own tree. Save historical snapshots under `.agentsam/merkle/`, which is ignored by default:

```bash
agentsam merkle snapshot . --out .agentsam/merkle/before.json
agentsam merkle snapshot . --out .agentsam/merkle/after.json
agentsam merkle diff .agentsam/merkle/before.json .agentsam/merkle/after.json --interactive
```

## Ignore rules

Default ignored names: `.git`, `node_modules`, `dist`, `.DS_Store`. Default ignored root subtrees/files: `.agentsam/cache`, `.agentsam/merkle`, `.agentsam/merkle.json`.

`--include dist` disables that default rule. Repeat `--include` for additional default rules. `--exclude generated` ignores that name at any depth; `--exclude assets/cache` ignores that exact relative subtree. Rules are literal paths, not globs or `.gitignore` patterns. Explicit exclusions take precedence.

The scanner hashes symlink target strings without following them. Special files, unrepresentable filenames, unreadable files, and directory depths over 256 produce errors instead of silently weakening the tree.

## Reusable Node library

```js
import { buildMerkleTree, readSnapshot, diffTrees } from '@inneranimalmedia/agentsam-sdk/merkle';

const baseline = await readSnapshot('./baseline.json');
const current = await buildMerkleTree('./checkout', { policy: baseline.policy });
const comparison = diffTrees(baseline, current);
```

The library is local filesystem tooling. It adds no Worker bindings, user/workspace identity, or network calls. The interoperable content hash format is specified in [MERKLE_V1](../protocol/MERKLE_V1.md), and semantic identity in [FILEMETA_V1](../protocol/FILEMETA_V1.md).

## AutoRAG use

AutoRAG consumes this package's content root and optional semantic metadata root as source evidence. During a code plan it compares those roots with the previous generation, reports changed paths, and reuses unchanged parsed chunks/vectors where their content identity still matches. Merkle is deterministic filesystem evidence; it is not a dependency graph, an AST graph, a vector index, or a replacement for Git history.
