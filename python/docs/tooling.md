# Host tooling for agentsam-sdk

Core Python package (`python/agentsam_sdk`) is **stdlib-only**
(`pip install -e .` adds no third-party deps). Optional packages under
`packages/` (e.g. `agentsam-site-scrape` with `requests`) are separate installs
and do not change that contract. See `docs/gaps.md` → Optional / network packages.

These **host** tools are expected on the operator/CI machine:

| Tool | Required for | Install (macOS) | Check |
|------|--------------|-----------------|-------|
| **Python ≥ 3.10** | all modules + unittest | Homebrew / pyenv | `python3 --version` |
| **jq** | filtering inventory / audit JSON on the CLI | `brew install jq` | `jq --version` |
| **wrangler** (Cloudflare CLI) | `data.d1_bloat`, `data.agentsam_walk` via `D1Adapter` | `npm i -g wrangler` (or repo local) | `wrangler --version` |
| **CLOUDFLARE_API_TOKEN** (env) | remote D1 execute | dashboard API token | `test -n "$CLOUDFLARE_API_TOKEN"` |
| **AGENTSAM_D1_DB_NAME** (env) | D1 tools when `--db` omitted | set in shell / `.env.cloudflare` loader | — |

Optional:

| Tool | Why |
|------|-----|
| `git` | repo-root detection in some callers |
| `node` / `npm` | IAM `npm run inventory:repo-size*` shims, wrangler install |

## Quick host check

From `agentsam-sdk/`:

```bash
./scripts/check-host-tooling.sh
# or:
./scripts/check-host-tooling.sh --require-d1   # also needs wrangler + token + db name
```

## jq recipes (inventory)

```bash
# category row for docs
agentsam repository inventory --repo-root .. --format json \
  | jq '.data.categories[] | select(.id=="docs")'

# top 10 largest files
agentsam repository inventory --repo-root .. --format json \
  | jq '.data.largest_files[:10]'

# totals only
jq '.totals' /tmp/inv/repository-inventory.json

# extensions over 100 files
jq '.by_extension | to_entries | map(select(.value > 100))' \
  /tmp/inv/repository-inventory.json
```

## jq recipes (per-file source bloat)

```bash
agentsam repository scan-bloat --root src --min-kb 10 --top 50 --json-envelope \
  | jq -r '.files[] | "\(.size_kb)KB\t\(.path)"'
```

## jq recipes (D1 audits)

```bash
agentsam data d1-bloat --db "$AGENTSAM_D1_DB_NAME" --quick --format json \
  --output-dir /tmp/d1-bloat
jq '.data.tables[:10] | .[] | {name, rows}' /tmp/d1-bloat/*.json 2>/dev/null \
  || jq '.' /tmp/d1-bloat/receipt-*.json | head
```

Exact JSON shapes vary by tool — prefer reading the written `*.json` under
`--output-dir` over scraping stdout when chaining in CI.
