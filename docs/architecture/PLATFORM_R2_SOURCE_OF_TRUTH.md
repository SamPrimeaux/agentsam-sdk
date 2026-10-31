# Platform R2 source-of-truth alignment

## Core rule

**Local workspaces author and build. Platform R2 stores approved source assets and released packages. D1 indexes identity, ownership, versions and routing.**

`agentsam-3d-studio` is an authoring/development workspace, not the canonical location for stock presets. It may contain editable working copies, generated outputs and temporary caches. Those files are not considered safely published until the corresponding R2 objects and manifest have been uploaded and verified.

## First-party bucket responsibilities

| R2 bucket | Responsibility | Access posture |
|---|---|---|
| `cad` | Platform-owned CAD stock presets, model source parts, compositions, project-template payloads and approved derivatives | Private; use the existing `CAD_PROJECT_ASSETS` binding for first-party runtime access and Wrangler for controlled publishing |
| `inneranimalmedia-schemas` | Versioned schemas organized by app and package | Public schema distribution through `schemas.inneranimalmedia.com`; writes through authorized platform access |
| `theme-store` | Installable themes, style packs, design systems and prebuild packages | Private; authorized installer/download route |
| `cms` | Published CMS media and public site assets | Public custom domain `cms.inneranimalmedia.com`; private drafts must not be placed in publicly readable paths |
| `agentsam-os-blueprint-content` (`WEBSITE_ASSETS` on the `agentsam-sdk` worker) | Website/blueprint content **and** durable D1 resource-rebuild backups under `backups/d1/...` | Bound on the Cloudflare Builds worker for `apps/local-studio` |
| `agent-sam` | Private desktop-update / release artifacts (`RELEASES` on `agentsam-desktop-updates`) | Private; not the rebuild backup target |

Do not create a bucket for every app or every asset family. Use app/resource/version prefixes inside the appropriate existing bucket. The existing `cad-assets` and `3d-assets` resources are not merged or deleted by this plan; they remain separate until a distinct purpose is established.

## Canonical paths

Existing CAD Creator payload keys are retained unchanged:

```text
cad/
  studio-templates/
    cad-creator/
      platform/
        modern_villa/v1/project.json
        scandinavian_loft/v1/project.json
        minimalist_studio/v1/project.json
        tech_coworking/v1/project.json
        presentation_pavilion/v1/project.json
        brand_showroom/v1/project.json
        creator_studio/v1/project.json
```

New stock-library releases use immutable app/resource/version prefixes:

```text
cad/
  library/
    stock/
      samsketch/
        v1/
          manifest.json
          payload/
          stl/
          previews/
      cad-creator/
        <resource-kind>/
          <slug>/
            v1/
              manifest.json
              source/
              derived/
              previews/
```

A release is never silently overwritten. Publish `v2`, `v3`, etc. D1 catalog records select the active version. The manifest contains object keys, content types, sizes, SHA-256 checksums, entry definitions and source-repository provenance.

For the schema bucket, keep the current app/package organization rather than a universal `agentsam/` dump:

```text
inneranimalmedia-schemas/
  apps/<app-id>/schemas/<schema-name>/v<major>/schema.json
  packages/<package-name>/schemas/<schema-name>/v<major>/schema.json
  platform/<capability>/schemas/<schema-name>/v<major>/schema.json
```

For `theme-store`:

```text
theme-store/
  themes/<theme-slug>/<version>/manifest.json
  themes/<theme-slug>/<version>/tokens.json
  themes/<theme-slug>/<version>/assets/...
  styles/<style-pack>/<version>/manifest.json
  prebuilds/<app-id>/<prebuild-slug>/<version>/manifest.json
  prebuilds/<app-id>/<prebuild-slug>/<version>/package.zip
```

D1 is the searchable catalog and compatibility index. R2 contains the package bytes. A catalog row is not proof that an object exists; publication must verify the R2 object and checksum before the row is activated.

## `agentsam-3d-studio` workflow

1. Pull or check out the required version from R2 before editing a released stock asset.
2. Work locally in `agentsam-3d-studio`; keep source code and build scripts in Git.
3. Build source parts, compositions and previews locally.
4. Run the stock-library plan and ensure every referenced file exists.
5. Publish to a new versioned `cad/library/stock/...` prefix.
6. Upload payloads first and the manifest last.
7. Read every published object back and compare SHA-256 with the manifest.
8. Register verified objects and template definitions in D1 using the separate registrar.
9. Applications resolve the catalog entry and R2 resource through `agentsam-content`; they do not depend on local filesystem paths.

The local cache defaults to `~/.cache/agentsam/r2-stock`, outside the busy working repository. It is disposable and reconstructable from R2.

## Provider and customer ownership boundaries

- R2 buckets are identified by `(Cloudflare account ID, bucket name)`, not bucket name alone.
- `user_oauth_tokens` remains the authorization/token source. Never copy OAuth access or refresh tokens into `r2_buckets`, `r2_objects`, or media records.
- `r2_buckets` identifies the bucket resource and its owner/account/connection metadata.
- `r2_storage_routes` selects a destination by principal, app and purpose.
- Platform stock remains in platform-owned R2. It is not silently copied into a customer's account.
- A customer may connect their own Cloudflare account through OAuth, select one of their discovered buckets for a specific app/purpose, and use that route at runtime.
- If a user has not selected an authorized destination, fail closed and ask for configuration. Never silently fall back to Sam's platform bucket.
- Fixed Worker bindings are reserved for deliberate first-party platform resources. Customer-specific bucket selection is resolved dynamically; do not add one environment variable or binding per customer/bucket.
- Cloudflare Stream is a separate provider. A Stream UID is a provider resource ID; it is never an R2 bucket or object key. A downloaded copy stored in an actual R2 bucket is a separate R2 asset with Stream origin provenance.

## D1 responsibilities

- `r2_buckets`: account-aware bucket identity, ownership, connection reference, access mode and inventory status. No credentials.
- `r2_objects`: cached object metadata. It is not the authoritative listing of R2 contents.
- `media_assets`: provider-neutral asset identity with provider-specific resource IDs; no tenant/workspace/project columns.
- `studio_templates`: reusable creative definitions, app of origin, resource kind, compatible apps and R2 payload/preview references.
- `r2_storage_routes`: explicit platform/user/tenant app-purpose routing.
- `asset_relationships`: links templates, media assets and stored objects without stuffing every relationship into one table.
- `moviemode_templates`: retained during the MovieMode domain migration; its three starter clips link to Cloudflare Stream media assets. MovieMode's compositions, transitions, animations, overlays and timelines remain separate resource kinds, not merely video records.
- `cms_3d_assets`: remains the CMS-specific 3D extension; it is not the universal 3D asset registry.

## Known reconciliation facts

- All seven existing CAD Creator template payloads under `cad/studio-templates/cad-creator/platform/.../v1/project.json` were fetched successfully during the planning pass.
- The legacy D1 bucket counter for `cad` reported four objects, while seven catalog payloads were independently retrievable. Treat the counter as stale until a full R2 inventory scan is performed.
- The pre-rebuild `r2_objects` cache does not currently enumerate those seven catalog payloads. The rebuild backfill registers the seven catalog-referenced objects without claiming it has performed a complete bucket scan.
- The first-party buckets `cms`, `theme-store` and `inneranimalmedia-schemas` exist in Cloudflare but were absent from the pre-rebuild D1 `r2_buckets` registry. The backfill registers them with inventory status `unverified`; it does not invent object counts.
- The existing Samsketch inventory dry-run resolves 68 entries (20 compositions, 48 source parts), 162 payload/source/preview objects, approximately 153 MiB, with no missing local source files. Those objects have not been uploaded by this plan.

## Migration safety

The D1 rebuild parks live tables as `*_legacy`, creates the new schema under the final canonical names, and backfills while preserving existing IDs. There is no `_v2` stage — `_v2` must never become a permanent table name. Parked `*_legacy` tables remain for rollback until deliberately dropped after consumers are confirmed. Full rollback is restore-from-backup.
