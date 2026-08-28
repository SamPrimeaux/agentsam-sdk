# Repository Intelligence

`repository.intelligence` is the read-only observation layer for understanding a repository as it exists at the current revision.

It is deliberately different from a preset code indexer. The scanner first discovers active files from Git (`git ls-files --cached --others --exclude-standard`) and falls back to a filesystem walk only outside a Git repository. It then derives language mix, manifests, directory density, recent Git churn, pressure points, hot files, and relative stability.

```bash
cd python
python -m agentsam_sdk.repository.intelligence --repo-root ..
python -m agentsam_sdk.repository.intelligence --repo-root .. --json
```

The snapshot is deterministic evidence suitable for CLI/TUI presentation or downstream agent reasoning. Scores are relative within a snapshot, not quality grades:

- **density** — code/file concentration
- **activity** — recent changed lines and commit touches
- **pressure** — code concentration weighted toward recent activity
- **stability** — inverse of recent activity

## Design law

The generic scanner must not know that a repository "should" have `src/`, `dashboard/`, `backend/`, `supabase/`, or any other product-specific path. Framework and platform files are detected as evidence through manifests; directory roles can be inferred in later layers.

## Next layers

1. Current snapshot: file tree, languages, manifests, density, churn, pressure, stability.
2. Dependency/entrypoint graph: imports, package boundaries, executable/runtime roots, fan-in/fan-out.
3. Snapshot diff: architectural movement between refs and responsibility migration.
4. Index plan: derive structural/chunks/reference/ignore recommendations from observed evidence.
5. Interactive TUI: browse pressure points, hot paths, diffs, and explanations without dumping the repository into an LLM context window.
