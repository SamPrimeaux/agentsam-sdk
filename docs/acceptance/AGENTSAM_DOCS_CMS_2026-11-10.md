# AgentSam Developer Center — CMS-native documentation migration

## Authority, status, provenance

- Site: `cms_sites.id=site_882ac8075543f0d4` (`agentsam-sdk`).
- Account scope: `au_871d920d1233cbd1`.
- Existing CMS schema: `agentsam.theme-project.v1`, not a new docs database or bespoke site editor.
- Generic reusable template builder: `packages/agentsam-docs-theme/cms-project.mjs`.
- Reusable portal CSS and interaction runtime: `packages/agentsam-docs-theme/docs-portal.{css,js}` (runtime source file named `docs-portal-runtime.js`).
- Structured source data: `docs/authoring/agentsam-sdk-docs-portal.json`.
- Build and schema validation: `node scripts/build-sam-docs-project.mjs --out=/tmp/agentsam-docs-portal-draft.json`.
- Public build assets are synced by existing `npm run site:sync`, including both the frontend and Local Studio mirror.
- Current project is **private draft only**; no live Worker deployment, HTML route substitution, or theme activation has occurred.

## Persisted draft for the actual AgentSam site

- Site theme import: `cms_site_themes.id=cmst_agentsam_sdk_source_import`, `status=installing`, `is_live=0`, `draft_revision=1`, `published_manifest_key=NULL`.
- CMS authoring project: `cms_globals.id=cmsg_9166ca7370c0731f`, `global_key=theme-project:theme_agentsam_docs_portal`, `content_version=1`, `status=draft`.
- History: `cms_revisions.id=cmsr_24468333ae3b9442`, `revision_kind=draft`, `revision_number=1`.
- R2 bucket: `agentsam-os-blueprint-content` via `WEBSITE_ASSETS`.
- Immutable R2 project: `cms/accounts/au_871d920d1233cbd1/sites/site_882ac8075543f0d4/theme-projects/theme_agentsam_docs_portal/revisions/000001-101221aad1ba1116.json`.
- Project SHA-256: `101221aad1ba1116e44ed6177bf04b67f03b3d90677977afa231384285bab47c`.
- Manifest: `cms/accounts/au_871d920d1233cbd1/sites/site_882ac8075543f0d4/theme-projects/theme_agentsam_docs_portal/manifests/draft-e413be9736802708.json`.
- Manifest SHA-256: `e413be97368027088a6a66a35a0c8d654f0945b8b1d747404dda49183c791c2b`.
- Both downloaded from remote R2 and byte-compared to the original source successfully.
- URL for authenticated editor after accepted Worker code is deployed:
  `/admin/theme-project-editor?project=theme_agentsam_docs_portal&site_id=site_882ac8075543f0d4`.
- Existing Heuristic/Revise drafts and all nine published CMS pages remain intact.

## First reusable content migration

Six page records: documentation overview, cookbook library, Merkle delta, terminal equivalence, native runtime and structured decisions; 36 CMS sections total.

Each page contains the same shared header/navigation and footer section identities. Nav groups/links, resource cards and code blocks use the existing repeatable block and field schema. The editor's page picker surfaces real project pages before stock templates. Same-project links switch documents inside the existing editor instead of navigating away. The project builder validates every route and resource-card destination against the page inventory.

The old infrastructure-cookbooks HTML contains more recipes than these first migrated pages; do not claim the full library is converted. The Merkle commands were preserved as **source examples pending verification against a released CLI**, not certified as runnable.

## Tests and build evidence

- `npm run verify:cms --prefix apps/ecommerce-cms-agentsam`: 93/93 pass, including new documentation contract tests.
- `node --test scripts/site-website-cms.test.mjs apps/ecommerce-cms-agentsam/tests/cms-documentation-theme.test.mjs`: 10/10 pass.
- `npm run site:sync`: pass.
- `npm run build --prefix apps/local-studio`: pass with both portal assets in staged output.
- `npm run cf:verify-output --prefix apps/local-studio`: pass.
- `npm run cf:smoke:worker --prefix apps/local-studio`: pass.
- `npx wrangler deploy -c backend/wrangler.jsonc --dry-run`: pass.
- GitHub PR #490 CMS Multisite Contract Checks: pass.
- Full SDK CI still fails at clean-install of an unavailable `@inneranimalmedia/agentsam-sdk@2.6.14`. This is a release precondition, not a green end-to-end deploy.

## Acceptance remaining before publishing

1. Finish SDK release dependency availability, then merge accepted PR #490 and deploy Worker from `main`.
2. Authenticated browser: open the *specific* Developer Center project in the CMS editor. Verify all six page links and pages are visible, and they cannot leak cross-site.
3. Edit a cookbook title, code example, navigation item, and resource card using the standard inspector. Save, refresh, reopen, and verify the same values in the renderer and D1/R2 revision trail.
4. Mobile: open/close menu, Escape and outside click, filter links, current-page indication; desktop: left navigation, article TOC, full code copy, keyboard focus and page switching.
5. Verify all new document links resolve to deployed routes before promoting them. Existing published docs pages are **not** automatically replaced.
6. Migrate remaining cookbooks as independent structured content pages, verify SDK commands against the released CLI, add metadata/version/search indexing and redirects only after acceptance.
7. Decide the live site theme selection through existing `cms_site_themes` and CMS publication flow. Do not set `is_live=1` or synthesize a `published_manifest_key` without receipt and live verification.

## Avoid architecture drift

The docs template is a reusable capability for customer technical documentation, help centers and learning portals, not an AgentSam-only CMS fork. D1 stores account/site identity and immutable R2 pointers; the same Theme Project Editor remains the only editor, including code editing and visual editing. HTML/CSS extracted from the previous website is migration source, not the permanent content authority.
