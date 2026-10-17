# Theme registry normalization, not theme table replacement

Verified in the main InnerAnimalMedia D1 database (2026-10-16): 123 rows, 121 unique raw slugs, 11 aliases. Families: 88 dark, 33 light, 2 custom. **No rows were merged or deleted.**

* `cms_themes.id` is the stable authority. Tenant-qualified lookup is mandatory; `slug` and `name` are not sufficient.
* `theme_family` is categorization (light/dark/custom), never a renderer identity.
* `alias_of_theme_id` is an explicit inheritance link. Resolve with cycle detection, authorization and a bounded lineage.
* Theme tokens must normalize the existing `config`, `tokens_json`, `css_vars_json`, `brand_json`, `typography_json`, `layout_json`, `components_json`, and `motion_json` into an **effective read model**. Do not overwrite their originals or infer token absence from `tokens_json = '{}'`.
* A section's `variant` (light, tint, dark, brand) remains a presentation parameter. Its `themeId` points to the installed theme. The normalizer never invents or clones a new `cms_themes` record for each variant.
* Monaco settings are editor controls; do not silently apply `monaco_theme` or `monaco_bg` to the public storefront.
* `css_r2_bucket` + `css_r2_key` address compiled CSS; `compiled_css_hash` tracks integrity. Rebuilds must be versioned and validated before switching active references.
* Start with read-only catalog/alias/token audits, then compare renderer screenshots and token hashes before an idempotent D1 migration. Preserve public/private visibility, tenant overrides and inactive records.

This SDK adapter is a pure typed normalization building block. It is **not** a replacement for the existing CMS theme registry and does not write production data.
