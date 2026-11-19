# Package schema registry

`inneranimalmedia-schemas` is the public contract bucket. New package schemas are published under one predictable layout:

- `packages/manifest.v1.schema.json` — schema for the root catalog
- `packages/manifest.v1.json` — discoverable package catalog
- `packages/{package}/v{major}/...` — immutable schema-major package contents
- `packages/{package}/v{major}/schema-pack.manifest.json` — checksummed package inventory

`protocol/` remains the source authority for shared contracts. Package-owned schemas stay with their owning package. The CMS-local merch and theme-contract copies are verified mirrors, not independent schema authorities. CAD Creator and Game Studio keep their existing release registries and are indexed by the root catalog. The `contracts/source-types.v2.*` contract remains a shared public contract because CAD schemas already reference its stable URI.

The old `agentsam/` object prefix is retained for compatibility. This publisher never deletes it.

## Commands

```bash
python3 scripts/schema-registry/publish_package_schemas.py verify
python3 scripts/schema-registry/publish_package_schemas.py build
python3 scripts/schema-registry/publish_package_schemas.py publish
```

The local operator environment must provide `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. `CLOUDFLARE_ACCOUNT_ID` may be set or supplied with `--account-id`. Publishing stages all objects, syncs without deletion, then downloads the published prefixes and verifies SHA-256 readback.
