# agentsam-site-scrape

Project-adaptive public-site crawling, extracted page/link/asset evidence,
deterministic indexing, and explicitly chosen local/R2 storage. One canonical
`site.scrape` capability: Node-native execution is the primary CLI; the older
Python image-classification/optimization workflow remains an optional adapter.
Neither runtime uses a platform-wide or publisher-owned R2 bucket by default.

**Canonical source:** `packages/agentsam-site-scrape/` in the SDK. The Python
adapter (`requests` dependency) is separate from the stdlib-only core Python
toolkit. Do not duplicate this package inside IAM or a customer repository.

**Status:** Node-native bounded crawler + Python compatibility adapter, with a
canonical site.scrape receipt, offline indexing graph and project-selected
storage. Customer production deployment still needs R2/IAM/CMS acceptance
proof. Canonical source is this repo only
(`packages/agentsam-site-scrape/` on `main`). Do not copy into the IAM platform
monorepo `tools/` tree.

## Native cross-platform path (recommended)

The canonical package now contains a **Node 22+ runtime**, independent of
Python, `sips`, or a specific customer's Cloudflare account. It uses real
HTTP fetching with bounded concurrency, public-DNS checks at socket resolution,
manual per-hop redirect validation, robots handling, structural HTML parsing,
content-addressed evidence, and a derived deterministic page/link/asset index.
Node crawling/archiving is local-first. Python remains a compatible optional
adapter for specialized local image workflows, not the required runtime.
Rust Machine/Repository inspect **local** sources; they do not fetch websites.
Knowledge may ingest the resulting verified site resource graph separately.

```sh
# Inside the SDK, or via an installed SDK exposing `agentsam site`:
agentsam site scrape https://example.com --project-root ./my-project --max-pages 10
agentsam site scrape https://example.com --project-root ./my-project --capture-assets
agentsam site storage --project-root ./my-project
agentsam site verify ./my-project/.agentsam/crawls/runs/<run-id>
agentsam site index ./my-project/.agentsam/crawls/runs/<run-id>
```

Project-local configuration (`./my-project/.agentsam/site-scrape.json`):

```json
{
  "account_id": "au_myaccount123",
  "project_id": "proj_myproject",
  "storage": { "evidence": { "provider": "r2", "bucket": "my-project-crawls" } }
}
```

The CLI also detects a `CRAWL_EVIDENCE` R2 binding in the selected project's
Wrangler config. No R2 bucket or Cloudflare credential is borrowed from the
SDK publisher. `--upload-archive` is **required** for a remote write. A local
only project can use `{ "storage": { "evidence": { "provider": "local" }}}`.
The local archive contains `receipt.json`, `index.json`, pages, and optional
assets. For remote upload, identity labels and an actual project-owned Wrangler
authorization are needed. CLI-provided IDs are not proof of IAM membership.

```sh
agentsam site scrape https://example.com --project-root ./my-project \
  --account-id au_myaccount123 --project-id proj_myproject \
  --upload-archive

# Recover an interrupted remote upload from the original verified archive:
agentsam site upload ./my-project/.agentsam/crawls/v1/accounts/au_myaccount123/projects/proj_myproject/runs/<run-id> \
  --project-root ./my-project
```

**Runtime limitations:** current Node mode fetches public server HTML (not
browser-executed JavaScript). Workers HTMLRewriter or other extraction adapters
can reuse its evidence contracts, but a distributed Queue/Worker execution lane,
CMS import/publish and real R2 account verification are separate deployment
gates. This is not an established production-scaled crawling service.

## Optional Python adapter

For the historical image classifier/optimizer, install this adapter separately.
The Node CLI above does not require Python.

```bash
cd packages/agentsam-site-scrape
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

### Adapter usage

```bash
# Local-only corpus, never uploads
python -m agentsam_site_scrape https://example.com --out ./corpus --yes

# Private evidence upload: uses the selected project's own R2 destination
python -m agentsam_site_scrape https://example.com --json \
  --repo-root /path/to/client-worker-repo \
  --archive-dir ./private-evidence --account-id au_example1234 \
  --project-id proj_example --upload-archive

# Legacy publishing requires a deliberate, separate flag
python -m agentsam_site_scrape https://example.com \
  --repo-root /path/to/client-worker-repo --publish-assets --yes
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

**The current project/user owns storage selection.** Never fall back to the SDK
publisher's Cloudflare credentials or any common account-wide bucket. Local-only
storage is the default when a project has not selected an R2 destination.
For remote R2 evidence choose an explicit bucket, a project-owned
`.agentsam/site-scrape.json` setting, or a `CRAWL_EVIDENCE` binding in *that
project's* Wrangler configuration. Use separate private buckets per project,
customer, or security boundary whenever appropriate; multiple projects under
one user's account may voluntarily share a bucket with scoped prefixes.
Within the selected bucket, a scoped run key is:

```
v1/accounts/au_<account>/projects/proj_<project>/runs/scrp_<run_id>/
  receipt.json
  manifest.json                     # uploaded LAST as the completion marker
  pages/00001.json                  # harvested page record
  assets/<sha256>.<ext>             # content-addressed, prepared asset evidence
```

The evidence bucket must be **private**, with no public custom domain.
Retention is selected by the project owner and its policy, not a platform-wide
30-day default. Approved assets go separately to the project's delivery/media
authority through review/promotion; do not implicitly publish. R2 object-key
prefixes are not security boundaries. Independent accounts, regions, billing,
and retention can be configured per project/customer as needed.

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

# Remote upload requires explicit opt-in and the currently selected project's Wrangler credentials.
python -m agentsam_site_scrape https://example.com --json --max-pages 2 \
  --account-id au_example1234 --project-id proj_example \
  --archive-dir ./private-crawl-evidence \
  --repo-root ./client-worker --upload-archive
# Project config or its CRAWL_EVIDENCE binding resolves the destination.
# Optionally select a different bucket with --archive-bucket <owned-bucket>.

# If upload fails, inspect the local manifest and retry WITHOUT recrawling:
python -m agentsam_site_scrape \
  --resume-archive ./private-crawl-evidence/v1/accounts/au_example1234/projects/proj_example/runs/scrp_<id> \
  --repo-root ./client-worker --upload-archive
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
