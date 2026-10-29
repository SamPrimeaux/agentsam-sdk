# Plain Jane Journal — SDK product staging

Source of truth: https://github.com/SamPrimeaux/inneranimalmedia-blog-template
at the pinned commit in provenance.json. The authored React/TypeScript site
lives under source/, generated storefront under site/, and SDK package contract
under src/ and prebuild.json. Never hand-edit the bundled output.

## Local verification

The SDK demo server serves the actual build at /themes/plain-jane/demo/ and the
CMS manifest at /themes/plain-jane/demo/journal-cms-manifest.json.

The source has nine seed pages and 18 component definitions. Real routes:
home, about, photography, two journal posts, contact, privacy, terms, 404.
All artwork in the authored repository is local; the original Google Fonts
import still requires network access and has fallback fonts.

For local dev:
1. Run npm ci and npm run lint from source/.
2. Run the package build script from the theme-plain-jane root.
3. Run node --test packages/theme-plain-jane/test/*.test.mjs from SDK root.
4. Optional: node packages/theme-plain-jane/scripts/export-preview-zip.mjs
5. Open /admin/store and Browse Templates, then Plain Jane Journal.

The UI is read-only. The external CMS needs to own all writes, revisions,
transactions and permissions. The exported manifest retains original section
and block IDs, definition keys, version and template SKU.

## Promotion gate

This package is private and not licensed for resale or production installation.
Do not infer commercial permission from source file headers. The preview ZIP
contains compiled UI, a sample SQL seed, provenance and explicit warnings.
It is not a customer-site installer.

Do NOT run seed/plain-jane-journal.sql against customer D1 databases without
a matching schema, ownership checks, validated parameters, backup and
transaction tests. Audit the existing CMS database before adding tables.

See docs/architecture/AGENTSAM-PRODUCT-CATALOG-RELEASES-20261028.md.
