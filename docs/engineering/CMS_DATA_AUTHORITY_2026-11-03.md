# AgentSam Local Studio — CMS data authority and release gates

Read-only live D1 inventory checked 2026-11-03. Never treat a site directory entry
as proof that its CMS content is in the platform database.

## Source of truth by screen

| Product surface | Existing D1 tables | Owner and integration contract |
| --- | --- | --- |
| Site picker | `accounts`, `cms_sites`, `workspaces`, `workspace_members`, `workspace_domains` | Platform; ownership must be checked before selecting a site. `is_default` is not permission. |
| Pages | `cms_pages` | Site's own CMS; page IDs, routes and status must remain site scoped. |
| Page Editor | `cms_page_sections`, `cms_section_blocks`, `cms_definitions`, `cms_revisions` | Site's own CMS; preserve source project identity and distinguish working drafts from published pages. |
| Theme Editor | `cms_globals`, `cms_artifacts`, `cms_themes`, `cms_site_theme_overrides`, `cms_revisions` | Site-scoped selected theme and R2 content; platform `cms_themes` is also used for older style presets. Do not promote previews as published. |
| Reusable parts | `cms_component_templates`, `cms_definitions` | Shared definition catalog; an installed instance belongs to the selected site's pages and sections. |
| Theme Store | `agentsam_products`, `agentsam_product_releases`, immutable R2 assets | Product distribution, not merchant inventory. |
| Media | `cms_assets` or merchant `media_assets`; site's R2 objects | Owning site; no global unscoped uploads or copied private assets. |
| Shop | `products`, `product_variants`, `store_collections`, `store_collection_products`, `store_settings` | Merchant D1, not platform `agentsam_products`. |
| Orders | `orders`, `order_items`, provider payment records | Merchant D1 and authorized payment integrations. |

## Deployed shape and content (read only)

- The hosted AgentSam SDK Worker binds `DB` to `inneranimalmedia-business`; its `WEBSITE_ASSETS` R2 bucket is separate from individual merchants' storage.
- Platform: 26 registered CMS sites, 79 pages, 171 page sections, 8 section blocks, 44 component definitions, 93 component templates, 132 theme preset records, 121 CMS assets. **No** `cms_globals` theme projects, `cms_artifacts`, `cms_revisions` or `agentsam_product_releases` existed when checked. Platform `products` and `orders` each had zero rows.
- AgentSam SDK site (`site_882ac8075543f0d4`): 8 existing published pages, 16 page sections, project identity `proj_agentsam_sdk`; CMS site id and project id are NOT interchangeable.
- InnerAnimalMedia site: 30 pages, 145 sections; most pages share `project_id=inneranimalmedia` with one legacy project outlier.
- The platform `cms_sites` row for Fuel exists but has zero corresponding platform `cms_pages`. Fuel's separate D1 is the source for its 10 CMS pages, 46 sections, 256 blocks, 115 revisions, 25 merchandise products, 170 variants, 8 collections, 9 orders and 750 media records.
- Platform `cms_pages` uses the older project-oriented shape (`project_id`, `project_slug`, `site_id`, no `account_id`). Fuel's CMS schema uses account-owned pages and does not contain the same `cms_sites` table. Never run one schema's SQL against the other.

## Correct read/write routing

1. Select site using authorized `cms_sites` identity; require an explicit choice when multiple sites exist.
2. Resolve the site's owner/adapter. A Worker-owned merchant is accessed through its authenticated, scoped CMS Worker API. The platform site is accessed through the platform-v1 adapter. Do not use the platform account's Cloudflare privileges as merchant authorization.
3. For an existing project-oriented site, create new pages with its **established** `project_id` and `project_slug`, never with `site_id` as a substitute. For an empty site, start with its own site identity. Ambiguous legacy source projects must fail safely.
4. Stage edits as drafts, verify version/ownership, preview them through the selected renderer, then publish only after an explicit approved transaction. An existing `published` page must not be silently mutated.
5. Installed theme releases must have validated manifest, packaged preview, content hash and R2 artifact. An empty release table means the customer cannot assume themes are installed.

## First acceptance slice

- Site: AgentSam SDK in the platform's existing D1. Use a safe disposable **draft** page.
- Prove site selection, page creation, correct project identity, reload and title change; preserve all currently published pages. New drafts open the actual Page Editor, and "View live" remains disabled until a valid published route exists.
- Prove existing page sections render by reading the owning site, and a false/foreign `site_id` is rejected.
- Use local and deployed Worker build/test gates before releasing.
- A full public-site publish and cross-merchant editing is **not** certified by this first slice: renderer/rollback, authoring authentication and remote Worker bridge tests remain required.

No schema creation, data copies, R2 migrations, or production writes are needed for the identity repair included in this branch.
