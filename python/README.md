# agentsam_sdk (Python) — npm mirror

Core repository/data commands remain **stdlib-only** (`dependencies = []`).
Rich is an optional renderer dependency used by the SDK's internal terminal preview lab;
it is not exposed as an installed-user renderer command.

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


## Internal Rich renderer preview

The npm SDK owns the public interactive experience. For renderer development only:

```bash
cd ..
npm run ui:preview -- tour
npm run ui:preview -- thinking
```

The Python module can also be invoked directly after installing the optional extra:

```bash
cd python
pip install -e '.[tui]'
PYTHONPATH=. python -m agentsam_sdk.tui --scene dashboard --check
```

`agentsam_sdk.tui` is presentation-only. It does not define tools, execution policy, or public CLI vocabulary.
