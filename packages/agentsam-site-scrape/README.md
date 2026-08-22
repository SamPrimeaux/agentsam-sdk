# agentsam-site-scrape

Reusable public-site crawler → image classifier/optimizer → R2 asset organizer
for AgentSam-managed client sites. Redesign of the Legendary-OS
`legendary_scrape.py` + `upload_to_r2.py` pair — not tied to any one client.

**Location in this repo:** `packages/agentsam-site-scrape/` (sibling to
`packages/agentsam-shell-kit/`). This is an **optional / network** Python
package (`requests` dependency). It does **not** live under
`python/agentsam_sdk/` and does **not** change the stdlib-only
`dependencies = []` contract of the core Python toolkit.

**Status:** live experimental. Canonical source is this repo only
(`packages/agentsam-site-scrape/` on `main`). Do not copy into the IAM platform
monorepo `tools/` tree.

## Install

```bash
cd packages/agentsam-site-scrape
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

## Usage

```bash
python -m agentsam_site_scrape https://example.com \
  --repo-root /path/to/client-worker-repo

# Local-only (no R2): omit --repo-root or choose placement [2]
python -m agentsam_site_scrape https://example.com --out ./corpus

# Non-interactive defaults (bucket still resolved from wrangler when uploading)
python -m agentsam_site_scrape https://example.com \
  --repo-root /path/to/client-worker-repo --yes
```

Flow: discover → confirm pages → placement (Auto / Local / Custom) → crawl →
classify → optimize (`sips` on macOS) → upload via `wrangler r2 object put`.

## Hard rules

- **`--repo-root` is the client worker repo**, never the IAM platform monorepo.
  Auto placement reads `WEBSITE_ASSETS` → `bucket_name` from that wrangler
  config. It does not invent domain-derived bucket names in `--yes` mode.
- Optimization requires macOS `sips`. Without `sips`, the run **fails loud**
  unless `--no-optimize` (or `--allow-unoptimized`) is set.
- Binding name is always `WEBSITE_ASSETS`; bucket stays per-client.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

No network required — pure unit tests for parse/classify/name/ssrf helpers.
