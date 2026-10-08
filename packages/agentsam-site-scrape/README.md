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

## Crawl evidence and the promotion boundary (v1)

**Do not use a customer's public `WEBSITE_ASSETS` bucket as raw crawl storage.**
Use one private, dedicated R2 bucket per operational environment (suggested:
`agentsam-crawl-evidence` for production, a separate staging bucket for development).
Within it, every crawl run has an account + project + run-scoped prefix:

```
v1/accounts/au_<account>/projects/proj_<project>/runs/scrp_<run_id>/
  receipt.json
  manifest.json                     # uploaded LAST as the completion marker
  pages/00001.json                  # harvested page record
  assets/<sha256>.<ext>             # content-addressed, prepared asset evidence
```

The bucket is **private**, with no public custom domain, and should have a
reasonable lifecycle expiry (start with 30 days for transient runs and adjust
when legal/customer retention needs are known). Approved assets go separately
to the site's delivery/media authority via a review/promotion step; do not
implicitly publish them. R2 has object-key prefixes, not true folders.
For customers requiring independent encryption, jurisdiction, retention, or
customer-controlled billing, allocate a separate bucket/account by policy,
not automatically one bucket per user.

**CLI account/project IDs are storage labels, not authorization.** The hosting
IAM/Worker backend must authorize account/project ownership and worker actions
before issuing an upload capability. A CLI operator's existing Wrangler
credentials authorize remote writes. Do not expose those credentials, use
user-supplied R2 bucket names as an authorization assertion, or surface raw
crawl objects through a public assets endpoint. No new D1 ownership table is
created by this package. It does not automatically create an R2 bucket or
change a deployed Worker binding.

### Stage a run locally (no remote writes)

```sh
python -m agentsam_site_scrape https://example.com --json --max-pages 2 \
  --account-id au_example1234 --project-id proj_example \
  --archive-dir ./private-crawl-evidence
```

`--json` emits one canonical `site.scrape` receipt on stdout; archive status
messages go to stderr. When archiving, stdout includes a `storage.status` of
`staged`, `uploaded`, or `failed` independently of `status` for crawl success.
A storage failure returns a nonzero exit code but still emits the crawl receipt. Add `--capture-assets --no-optimize` to also retain
public-page image assets without needing macOS `sips`, or use `--capture-assets`
with `sips` installed to prepare images. Asset failure counts appear in the
canonical receipt, and private archive manifest records original image URLs. The local evidence manifest is written **before**
temporary crawl files are deleted. The noninteractive JSON path defaults to **page metadata only**, not rendered HTML or full text;
unsupported input fields remain explicitly reported in the receipt.

### Validate, upload, or resume an archive

```sh
python -m agentsam_site_scrape --verify-archive ./private-crawl-evidence/v1/accounts/au_example1234/projects/proj_example/runs/scrp_<id>

# Remote upload requires explicit opt-in; bucket should already exist privately.
python -m agentsam_site_scrape https://example.com --json --max-pages 2 \
  --account-id au_example1234 --project-id proj_example \
  --archive-dir ./private-crawl-evidence \
  --archive-bucket agentsam-crawl-evidence --repo-root ./client-worker \
  --upload-archive

# If upload fails, inspect the local manifest and retry WITHOUT recrawling:
python -m agentsam_site_scrape \
  --resume-archive ./private-crawl-evidence/v1/accounts/au_example1234/projects/proj_example/runs/scrp_<id> \
  --archive-bucket agentsam-crawl-evidence --repo-root ./client-worker \
  --upload-archive
```

Remote upload checks all local hashes first, uploads the manifest last, and
fails on a missing/modified object. A partially uploaded run has no new
successful manifest marker. Enforce non-overwrite/retention on the bucket as
appropriate; CLI checks alone are **not** an R2 immutability guarantee.

### Explicit site delivery asset publishing

The older interactive site-asset flow still exists for operator-reviewed
promotion. It now requires `--publish-assets` and an actual client repo with
`WEBSITE_ASSETS` configured; simply passing `--repo-root` or `--yes` does not
implicitly publish third-party assets. `--json` does not support this
promotion step. Website/media selection, rights review, and the final CMS
attachment must be verified separately; copying files to R2 is not CMS
publication proof.

```sh
python -m agentsam_site_scrape https://example.com \
  --repo-root ./client-worker --publish-assets --yes
```

**Acceptance gates:** contract tests and a local read-only crawl; private
manifest/asset integrity tests; actual R2 upload permissions with a dedicated
bucket; and CMS import/publish tests against the canonical project authority.
The package is not `READY` for customer delivery until the latter two gates
are performed against authorized infrastructure.
