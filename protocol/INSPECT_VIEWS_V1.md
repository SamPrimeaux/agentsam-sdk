# AgentSam Inspect Views v1

`repository.snapshot` remains the canonical deterministic repository evidence envelope. Its three independent repository identities remain unchanged:

- `tree.merkle_root` — content identity (paths, bytes, symlink targets)
- `tree.manifest.policy_hash` — capture-scope identity
- `tree.metadata_root` — `agentsam-filemeta/v1` semantic metadata identity

Inspect views are **derived projections**, not new repository identities. A projection carries the canonical `snapshot_id`, `content_hash`, and three roots unchanged and adds a separate `projection.projection_hash` for the bounded view itself.

## Agent routing flow

Start with a small facet index instead of injecting every file record:

```sh
agentsam inspect --cwd . --view index --json
```

Then request only the likely feature surface:

```sh
agentsam inspect --cwd . --view files --system identity --tag authentication --limit 40 --json
agentsam inspect --cwd . --view files --system cms-frontend --category cms-editor --json
agentsam inspect --cwd . --view files --path 'packages/agentsam-workbench/**' --match terminal --json
```

Supported selectors are `system`, `package`, `category`, `layer`, `kind`, `language`, `role`, `tag`, `path`, `symbol`, `import`, and `match`. Different selector classes are ANDed; repeated values within one selector class are alternatives. `--match` terms are all required and are tested against routing metadata, paths, tags, symbols, and imports.

`--view files` returns compact routing records and never changes `metadata_root`. Use `--view full` when a persistence or verification lane genuinely needs the full canonical evidence envelope.

Machine JSON is compact by default. `--pretty` is presentation-only and never changes any repository identity.
