# AgentSam Merkle Persistence v1

Persistence is a host concern layered on top of the portable Merkle protocol. The SDK exposes the canonical table name, storage prefix, logical asset binding, storage-key helper, and portable SQL schema without owning a customer's database or cloud credentials.

## Authority split

```text
root_hash       = filesystem/content authority
metadata_root   = semantic/index authority
policy_hash     = capture-scope authority
```

None replaces another.

The canonical optional index table is `agentsam_fs_merkle_snapshots`. Full snapshot documents are stored beneath the provider-neutral prefix `agentsam_fs_merkle_snapshots/`.

For Cloudflare presets the logical R2 role is `WEBSITE_ASSETS`. The generated/hosting application decides which physical bucket is bound to that role. A customer may therefore bind their own bucket without changing SDK code:

```toml
[[r2_buckets]]
binding = "WEBSITE_ASSETS"
bucket_name = "customer-selected-bucket"
```

A host with dynamic or non-Cloudflare storage may inject its own storage adapter instead. The SDK must not infer user identity, account authority, bucket credentials, or deployment identity.

Typical keys are:

```text
agentsam_fs_merkle_snapshots/<owner>/<repo>/<snapshot>.json
```

`storage_bucket` records the actual physical destination selected by the host; `storage_key` records the object key. D1/SQLite is the searchable index, not the blob store.

## CLI publication

Create the semantic snapshot once, then publish that exact file through the host's logical bindings:

```sh
agentsam merkle snapshot . --semantic --out .agentsam/merkle.json
agentsam merkle persist .agentsam/merkle.json \
  --wrangler-config path/to/wrangler.toml \
  --owner-user-id "$AGENTSAM_OWNER_USER_ID" \
  --capture-kind deploy \
  --deployment-id "$DEPLOYMENT_ID"
```

`agentsam merkle persist` resolves `WEBSITE_ASSETS` and `DB` from the selected Wrangler config. It never hard-codes a customer's bucket or database and never invents `owner_user_id`. `--dry-run` emits the resolved R2 key and D1 row without writes; `--r2-only` is available when the host intentionally does not maintain the index table.

The canonical `agentsam-sdk` Worker binds `WEBSITE_ASSETS` to `agentsam-os-blueprint-content` for the SDK's own development/deployment snapshots. That physical name is an installation choice, not part of the portable protocol; generated/customer Workers should bind `WEBSITE_ASSETS` to their selected bucket while retaining the `agentsam_fs_merkle_snapshots/` object namespace.
