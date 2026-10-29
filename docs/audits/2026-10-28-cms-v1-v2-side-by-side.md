# CMS schemas: SDK v1 vs standalone site-first v2

Source comparison as of 2026-10-28, not live customer D1 introspection.

| Feature | SDK packaged v1 | Standalone CMS working v2 | Recommended |
|---|---|---|---|
| Total tables | 14, including 7 runtime discovery/control tables | 16 CMS content/theme tables | v2 for content, retain runtime catalogs separately |
| Site | cms_sites: name, initials, domain, theme_json | cms_sites: primary_domain, settings_json, status | v2 site identity and tenant scope |
| Page | cms_pages: site_id, slug, status, type, meta_title, meta_description | cms_pages: definition_id, parent_page_id, config_json, canonical_url, r2_bucket, status | v2 + route and SEO compatibility |
| Section | cms_sections: name, type, visible, fields_json, css_json, sort_order | cms_page_sections: definition_id, section_data, css_classes, content_hash, sort_order | cms_page_sections |
| Block | cms_blocks: section_id, type, visible, data_json | cms_section_blocks: parent_block_id, block_key, definition_id, content_json, settings_json, artifact_id | cms_section_blocks |
| Definitions | no central definitions table | cms_definitions: version, settings_schema_json, allowed_blocks_json | v2 |
| Templates | no normalized catalog | cms_component_templates: editor_schema_json, template_data, compatibility, responsive fields | v2 |
| Themes | site.theme_json | cms_themes, cms_theme_preferences, cms_global_settings | v2 |
| Navigation | no normalized menus | cms_navigation_menus | v2 |
| Collections | no normalized collections | cms_collections, cms_collection_assets | v2 |
| Assets | cms_assets: site_id, url, asset_key, mime_type | cms_assets: r2_key, metadata_json; cms_3d_assets | v2 with URL -> R2 mapping |
| Revisions | cms_revisions: snapshot_json, page_id, kind | cms_revisions: revised v2 structure | requires deep comparison |
| Publishing | cms_publications: route, revision_num, sections_json, theme, metadata_json | cms_publications: publication_id, theme, published_at, other fields | preserve older snapshot/version data until proven |
| Runtime descriptions | cms_runtime_info, table/capability/tool/skill catalogs, usage guides, migrations | not part of site-first v2 content schema | retain as portable metadata, NOT duplicate content authority |

## Normalization choice

Use the standalone site-first v2 shape as the target for new customer CMS
persistence: cms_sites -> cms_pages -> cms_page_sections ->
cms_section_blocks, with definitions, component templates, themes,
navigation, assets, collections and publication receipts.

Do not simply delete the v1 schema. The existing SDK Node operations and
portable CLI still query v1 cms_sections/cms_blocks. Retain those contracts
behind an explicit, versioned adapter mapping to the v2 site-first persisted
shape. Keep self-describing runtime/tool catalogs as portable control metadata.
Do not build two concurrently authoritative families of page tables.

## Migration gates

1. Review and commit the dirty v2 working branch only after owner signoff.
2. Introspect hosted and customer D1 schemas read-only: tables, fields,
   foreign keys, indexes, tenants, versions, publications, legacy content.
3. Resolve publication snapshot and revision differences explicitly.
4. Implement a versioned repository adapter and read-compare against
   disposable, sanitized local SQLite fixtures.
5. Test create/edit/duplicate/reorder/preview/publish/rollback with
   authorization, tenant isolation, optimistic revisions and stable IDs.
6. Promote a new, explicitly versioned SDK CMS runtime export only after
   the schema contracts and fixture parity tests pass.
7. Back up, migrate, and reconcile customers one tenant at a time. No
   destructive D1 or R2 operations from this preliminary comparison.

Evidence: standalone v2 currently defines 16 content tables, 22 local tests
pass. SDK v1 and Node adapter each define 14 tables, 3 isolated SDK tests
pass. Plain Jane Journal includes an 11-table seed, not a migration. No
live D1 or production R2 content has been read in this comparison.
