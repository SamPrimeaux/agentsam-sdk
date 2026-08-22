# agentsam_sdk (Python) — npm mirror

Exact dual-home of `inneranimalmedia/agentsam-sdk/`. **Stdlib-only**
(`dependencies = []` in `pyproject.toml`).

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
