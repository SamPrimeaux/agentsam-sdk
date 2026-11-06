# Independent Canvas to CMS handoff map

## Status distinctions

1. **Canvas**: independent private editable document with creative direction,
   source structure, component identifiers, revision and assets. No site ID
   required. It can remain a Canvas forever.
2. **CMS-compatible**: analysis confirms potential mappings for pages,
   sections/blocks, settings, content, responsive behavior and assets;
   missing mappings are recorded. Still not an installed theme.
3. **Theme draft**: an authorized conversion deliberately creates or links
   a real draft project via the existing CMS owner. Preserve the source
   Canvas and provenance, store source-to-target mappings and receipts.
4. **Preview**: render the draft and verify live data/asset bindings without
   modifying the published site.
5. **Published**: explicit permission and user approval, verified deployment,
   saved revision proof and rollback.

## Source and target boundaries

For InnerAnimalMedia SDK installations, inspect the current owners at:
- `apps/ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs`
- `apps/ecommerce-cms-agentsam/backend/cms/site-context.mjs`
- `apps/local-studio/backend/worker/studio-website-theme-install.js`
- `apps/local-studio/backend/worker/studio-theme-drafts.js`
- `apps/local-studio/backend/worker/cms-source.js`
- `apps/local-studio/backend/worker/cms-authority.js`

Do not assume these modules exist in third-party SDK clones; discover the
host's equivalent authoritative adapter. On current IAM installations,
theme-projects are represented via CMS global/revision storage and R2;
old `cms_themes` appearance rows are **not** the general theme-project owner.

## Mapping questions for conversion

- Can each authored route/page map to a supported CMS page/template?
- Which elements become reusable CMS sections and typed editable blocks?
- Which properties become theme settings/design tokens versus content fields?
- Which product/collection/navigation/cart/search slots actually have
  authorized data bindings? What is the empty state when no live data exists?
- Which interactions need server operations/auth or cannot map at all?
- Are responsiveness, keyboard interaction, motion alternatives and visual
  fidelity retained?
- Are source imagery/media rights, transforms and provenance preserved?
- Does the preview use the saved draft revision? Can the user reopen in the
  normal CMS theme editor and keep editing?
- Is explicit publishing authority distinct from drafting authority?

If required mappings are missing, return a concrete conversion report.
Never fabricate CMS wiring to make the preview look completed.
