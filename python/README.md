# agentsam_sdk (Python) — npm mirror

Core repository/data commands remain **stdlib-only** (`dependencies = []`).
The Rich terminal UI is an optional `tui` extra and lives with the SDK CLI,
not in the application tool catalog.

```bash
cd python && pip install -e .
agentsam repository inventory --repo-root /path/to/repo --format json
python3 -m unittest discover -s tests -v
./scripts/check-host-tooling.sh
```

Protocol: [`../protocol/README.md`](../protocol/README.md). Do not advance this tree without mirroring the monorepo (or the reverse).

## Optional sibling packages (not part of stdlib core)

| Package | Path | Notes |
|---------|------|-------|
| `agentsam-site-scrape` | [`../packages/agentsam-site-scrape/`](../packages/agentsam-site-scrape/) | Optional/network (`requests`); crawl→R2. Dual-homed with IAM `tools/agentsam-site-scrape/`. Does **not** fold into `agentsam_sdk`. |


## Optional terminal UI

```bash
cd python
pip install -e '.[tui]'
agentsam tui
agentsam tui --scene dashboard
agentsam tui --check
```

`agentsam_sdk.tui` is presentation-only. It does not define tools or execution policy.
