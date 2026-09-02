# Merkle CLI and terminal explorer

```bash
agentsam merkle root .
agentsam merkle root . --include dist
agentsam merkle snapshot . --out .agentsam/merkle.json
agentsam merkle verify .agentsam/merkle.json
agentsam merkle diff ./copy-a ./copy-b --tui
agentsam merkle inspect .
agentsam tui merkle .
```

The commands work on ordinary folders, including a mini prototype. Git, cloud accounts, databases, and containers are not required. Only `snapshot` writes files. There is no synchronization/restore command or background watcher in this version.

## Commands

| Command | Behavior |
| --- | --- |
| `root [path]` | Computes SHA-256 content identity; defaults to the current directory. |
| `snapshot [path]` | Saves a versioned manifest; defaults to `<path>/.agentsam/merkle.json`. |
| `verify <snapshot>` | Rescans the recorded root and reports unchanged, modified, added, and removed files/links. |
| `diff <a> <b>` | Compares directories, snapshots, or one of each. No files are copied. |
| `inspect [path]` | Prints the full tree/hash breakdown; also accepts a snapshot. |
| `tui [path]` | Opens the keyboard-driven explorer. Alias: `agentsam tui merkle [path]`. |

`--tui` also works with root, inspect, verify, and diff. Up/down or j/k select an entry; Enter/right expands a directory; left collapses it. `c` filters changes, `r` rescans, and q/Esc/Ctrl+C exits. The UI uses real scan counts, honors `NO_COLOR`, adapts to terminal resize, wraps the selected hash on narrow screens, and restores the cursor and terminal mode on exit. `r` does not update a saved baseline. Failed rescans remain visible and exit as an error.

With piped output or `TERM=dumb`, the TUI prints once and exits. `--json` always bypasses interactive mode. Root JSON contains `rootPath`, `rootHash`, `stats`, and `policy`; verify/diff JSON contains `equal`, roots, counts, and the changed entries. Inspect/snapshot output contains the full manifest (snapshot adds `output`).

Exit codes: **0** success/match, **1** differences, **2** invalid input/scan error, **130** interrupted non-interactive scan. Interactive quit after a completed comparison retains its match/difference exit code.

## Comparing machines and preserving baselines

Copy a manifest to another machine, then explicitly select that machine's checkout:

```bash
agentsam merkle verify ./baseline.json --root ./local-copy --tui
```

Verification uses the saved include/exclude policy. Roots are independent of absolute paths, timestamps, permissions, and creation order. Matching roots mean the **included relative names, file bytes, and literal symlink targets** match, subject to SHA-256 collision resistance. Empty directories are omitted. Line endings, Unicode filename normalization, and symlink target spelling are not normalized.

Snapshots are baselines, not signatures or attestations of who created them. Protect a trusted baseline separately. For a consistent scan, avoid editing the directory while hashing it; detectable changes/read errors fail the scan, but this is not an atomic filesystem snapshot.

Existing snapshot files are not overwritten without `--force`. Snapshot output is excluded from its own tree. The manifest records a custom output exclusion when necessary. Save multiple historical snapshots under `.agentsam/merkle/`, which is ignored by default:

```bash
agentsam merkle snapshot . --out .agentsam/merkle/before.json
agentsam merkle snapshot . --out .agentsam/merkle/after.json
agentsam merkle diff .agentsam/merkle/before.json .agentsam/merkle/after.json --tui
```

## Ignore rules

Default ignored names: `.git`, `node_modules`, `dist`, `.DS_Store`. Default ignored root subtrees/files: `.agentsam/cache`, `.agentsam/merkle`, `.agentsam/merkle.json`.

`--include dist` disables that default rule. Repeat `--include` for additional default rules. `--exclude generated` ignores that name at any depth; `--exclude assets/cache` ignores that exact relative subtree. Rules are literal paths, not globs or `.gitignore` patterns. Explicit exclusions take precedence. Comparing snapshots with different policies is refused; a directory compared with a snapshot uses the snapshot's policy.

The scanner hashes symlink target strings without following them. Special files (sockets, pipes, devices), unrepresentable filenames, unreadable files, and directory depths over 256 produce errors instead of silently weakening the tree.

## Reusable Node library

```js
import { buildMerkleTree, saveSnapshot, readSnapshot, diffTrees } from '@inneranimalmedia/agentsam-sdk/merkle';

const baseline = await readSnapshot('./baseline.json');
const current = await buildMerkleTree('./checkout', { policy: baseline.policy });
const comparison = diffTrees(baseline, current);
```

The library is local filesystem tooling. It adds no Worker bindings, user/workspace identity, network calls, or package dependencies. The interoperable hash format is specified in [MERKLE_V1](../protocol/MERKLE_V1.md).
