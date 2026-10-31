# AgentSam product / release catalog contract

Finished contract for **versioned installable artifacts**. Complements the live
`agentsam_products` identity catalog; does **not** invent a parallel product table.

## Authority

| Layer | Owner |
|---|---|
| Product identity | **`agentsam_products`** (already live on `inneranimalmedia-business`) |
| Versioned releases | **`agentsam_product_releases`** — `migrations/runtime/0011_agentsam_product_releases.sql` |
| Bytes | **Per-product R2** (theme-store → theme packages; Local Studio → `agentsam-os-blueprint-content`; never a company dump) |
| Update / resolve metadata API | Prefer **`iam-pwa-services`** (`services.inneranimalmedia.com`) as the boring hub; workers may thin-proxy |
| Offline package knowledge | `packages/catalog` JSON — CLI explain only, not download authority |
| Theme Store listing | `inneranimalmedia-theme-store` Worker catalog — must eventually publish rows here (or read this table) |

## Explicit non-goals (do not overload)

| Table / surface | Why not |
|---|---|
| `agentsam_plugins` (+ health / oauth) | Account-scoped integrations, not global releases |
| `desktop_shell_releases` | Tauri-only stub — **do not apply**; superseded by this contract |
| `dashboard_versions` | IAM web asset deploy ledger |
| `products_catalog` | Commercial billing tiers |
| `agentsam_artifacts` | Per-user generated artifacts (`tenant_id` / user scope) |
| `r2_deploy_manifests` | Empty site-deploy ledger; wrong shape |

## Roles

1. **`agentsam_products`** — stable product (`slug`, `kind`, `package_name`, maturity `status`, optional `sku`).
2. **`agentsam_product_releases`** — one immutable artifact row per
   `(product_slug, version, channel, artifact_kind, target?, arch?)`.
3. **Install / entitlement** — host-owned (CMS installs, Theme Store checkout, account grants). Release rows may carry `entitlement_policy_json` hints only.
4. **Clients** — Theme Store, Local Studio `/admin/store`, Tauri updater, CLI download — all read **published** releases; only signed backends write.

## Field contract (release row)

Required product catalog fields from the 2026-10-28 product decision, mapped:

| Spec field | Column |
|---|---|
| sku | `sku` (optional; themes often `iam.theme.<slug>`) |
| kind (product) | via `agentsam_products.kind` + `artifact_kind` |
| package | `package_name` |
| version | `version` |
| source_sha | `source_sha` |
| preview_url | `preview_url` |
| cms_manifest_url | `cms_manifest_url` |
| artifact_url | `artifact_url` (+ `r2_bucket` / `r2_key`) |
| sha256 | `sha256` |
| runtime_requirements | `runtime_requirements_json` |
| compatible_schema_version | `compatible_schema_version` |
| entitlement policy | `entitlement_policy_json` |
| review_status | `review_status` |
| release_status | `release_status` |
| install_status | **not on release** — lives on host install receipts |

### `artifact_kind`

| Kind | Typical bytes |
|---|---|
| `theme_zip` | Theme Store ZIP under product R2 |
| `app_bundle` | Packaged web/app archive |
| `desktop_native` | Tauri `.dmg` / `.app` / `.msi` (+ minisign `signature`) |
| `sdk_tarball` | Published SDK pack |
| `cms_seed` | Seed SQL / CMS import pack |
| `preview_site` | Static preview tree |
| `other` | Escape hatch |

### Desktop / Tauri

- Brand manifest `app_id` (e.g. `local-studio`) → `desktop_app_id`.
- Product slug stays catalog identity (e.g. `agentsam-local-studio`).
- `artifact_kind = 'desktop_native'` requires `target`, `arch`, `signature`, `artifact_url`.
- Updater check: latest **published** row for `(desktop_app_id, channel, target, arch)` where `isNewer(version, current)`.
- Do **not** create `desktop_shell_releases`.

### Channels

`test` | `preview` | `release` — same vocabulary as today’s native prefix layout.

## Write pattern

1. Ensure `agentsam_products` row exists (`slug` / `kind`).
2. Upload immutable bytes to **that product’s** R2 key namespace.
3. Insert `agentsam_product_releases` with `release_status = draft|staged`.
4. After review, set `published` + `published_at_unix` + `pub_date`.
5. Yank with `yanked` + `yanked_at_unix` (do not delete; keep audit).

## Relationship to Theme Store

Theme Store’s in-worker `ThemeRecord.release` (`status`, `sha256`, `storageKey`) is a **preview listing**. Production authority for published downloads should converge on this D1 table (or Theme Store becomes a writer/reader of it). CMS site installs remain CMS-owned (`cms_theme_installations` etc.), not Theme Store DB.

## Relationship to PWA services

`iam-pwa-services` owns boring **resolve / check / publish** HTTP for installable clients. It should query this table (and SW manifests for browser PWAs), not invent a third registry.
