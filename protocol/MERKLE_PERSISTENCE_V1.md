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
