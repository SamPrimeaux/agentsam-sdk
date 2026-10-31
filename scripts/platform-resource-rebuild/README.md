# Platform resource rebuild

Ordered, staged rebuild for the `inneranimalmedia-business` D1 database. Separate Python steps — not one all-in-one migration runner.

## Safety model

- Every script is dry-run/read-only by default.
- Remote DDL/DML requires both `--apply` and `--confirm-production`.
- Live tables are parked as `*_legacy`, then the rebuilt schema is created under the **final** names (`r2_buckets`, `r2_objects`, `media_assets`, `studio_templates`, `r2_storage_routes`). There is no `_v2` stage and `_v2` must never become a permanent name.
- Backups exclude `user_oauth_tokens` and secret/vault material.
- `r2_buckets` stores account/resource identity and routing metadata, never access tokens or S3 secrets.
- `r2_objects` is an inventory cache. R2 itself remains authoritative.
- `media_assets` separates R2 object identity from Cloudflare Stream resource identity and removes tenant/workspace/project columns. Legacy scope is retained inside metadata for provenance.
- MovieMode's three starter clips remain in `moviemode_templates`; relationships connect them to canonical Stream media records. This does not make MovieMode a video-only product.

## Ordered D1 rebuild

Run from `/Users/samprimeaux/agentsam-sdk`:

```bash
# 0. Offline SQL and stock-registration fixtures; no Cloudflare access required.
python3 scripts/platform-resource-rebuild/07_test_sqlite.py

# 1. Read-only remote inventory; does not select OAuth token values.
python3 scripts/platform-resource-rebuild/00_preflight.py

# 2. Export only tables being rebuilt. Recommended: retain the backup in private R2.
python3 scripts/platform-resource-rebuild/01_backup.py --upload-to-r2 --confirm-backup-upload

# 3. Park live tables as *_legacy, then create canonical tables under final names.
python3 scripts/platform-resource-rebuild/02_apply_ddl.py --apply --confirm-production

# 4. Backfill from *_legacy into the canonical tables.
python3 scripts/platform-resource-rebuild/03_backfill.py --apply --confirm-production

# 5. Read-only parity and integrity checks (also asserts no leftover *_v2).
python3 scripts/platform-resource-rebuild/04_validate.py
```

The backup step writes a local working copy under `~/.cache/agentsam/resource-rebuild/` and, when requested, uploads the SQL export and manifest to private `agent-sam/backups/d1/inneranimalmedia-business/resource-rebuild/`.

Do not drop `*_legacy` until consumers are confirmed on the rebuilt schema and you have an explicit cleanup step. Rollback is restore-from-backup, not “flip `_v2` names.”

## Ordered R2 stock-library workflow

The first-party platform bucket is `cad`. Existing CAD Creator starter payloads remain at their current keys under `studio-templates/cad-creator/platform/`; all seven were fetched successfully during the planning pass.

The existing `agentsam-3d-studio` inventory contains 20 compositions and 48 source parts. The current exporter dry-run resolves 162 objects (about 153 MiB) with no missing source files. `05_stock_r2.py` reuses its inventory/build logic without editing that repo.

```bash
# Plan only; no R2 or D1 writes.
python3 scripts/platform-resource-rebuild/05_stock_r2.py plan

# Publish to a new immutable version prefix. Full read-back/checksum verification runs by default.
python3 scripts/platform-resource-rebuild/05_stock_r2.py publish --apply --confirm-platform-stock

# Verify an already-published version and create a local verification receipt.
python3 scripts/platform-resource-rebuild/05_stock_r2.py verify

# Optional working copy. R2 remains canonical.
python3 scripts/platform-resource-rebuild/05_stock_r2.py pull

# After canonical DDL/backfill and successful R2 verification, index the manifest in D1.
python3 scripts/platform-resource-rebuild/06_register_stock_library.py --apply --confirm-production
```

To publish a new immutable version, use `--version v2` and pass that version's local manifest to the registrar. Do not overwrite a released version. `publish` uploads payload objects first and publishes `manifest.json` last, so consumers never see a complete manifest pointer before its objects exist.

`06_register_stock_library.py` requires a verification receipt matching the exact manifest SHA-256. It upserts `r2_objects`, `studio_templates`, and `asset_relationships`.

## Cloudflare authentication note

Remote Wrangler steps require a valid local Wrangler session. The Python files compile and the SQL passes the offline SQLite fixture; do not run remote DDL/DML until auth works. No remote DDL, DML, export or R2 upload is performed merely by landing this kit on `main`.
