# AgentSam Offline Knowledge Machinery Kit v2

This revision is designed for a repository with dozens of packages.

The goal is not to hand-author 57 manifests blindly. The goal is:

1. inventory every package;
2. collect evidence from each package itself;
3. draft a conservative manifest from that evidence;
4. mark ambiguous fields for review;
5. validate all reviewed manifests;
6. build deterministic package/topic/runtime indexes;
7. power `agentsam explain`, `agentsam choose runtime`, and `agentsam assist`;
8. prove those commands from an isolated packed install with no LLM/provider/network dependency.

## Product law

Python is build/release machinery.

A normal customer must **not** need Python to use:

```text
agentsam explain ...
agentsam choose runtime ...
agentsam assist ...
agentsam doctor
```

The packaged AgentSam JS/TS CLI consumes generated JSON.

## Recommended sequence

```bash
python3 scripts/catalog/inventory_packages.py --repo .
python3 scripts/catalog/collect_package_evidence.py --repo .
python3 scripts/catalog/draft_package_manifests.py --repo . --dry-run
python3 scripts/catalog/draft_package_manifests.py --repo . --write
python3 scripts/catalog/review_queue.py --repo .
python3 scripts/catalog/build_catalog.py --repo .
python3 scripts/catalog/build_catalog.py --repo . --check
```

Then implement/verify the actual CLI commands and run:

```bash
python3 scripts/catalog/acceptance_randomuser.py --repo .
```

## Why evidence first?

A package name alone is not enough to safely invent:

- purpose
- public/internal status
- runtime compatibility
- supported languages
- execution domains
- installation method
- use/avoid guidance

The evidence pass reads what the package already says and does:
`package.json`, `Cargo.toml`, README text, exports, files, and dependency signals.

The draft pass may fill factual/mechanical fields automatically, but ambiguous product positioning remains `needs-review`.
