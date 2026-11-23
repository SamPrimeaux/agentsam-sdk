# Ecommerce CMS — site and new-theme entry contract

## Separate products; one account-owned site identity

- **Sites → Create store** uses the existing account-authorized `/start` workflow. No `studio_templates` row is required to initiate website creation. Site creation is not theme-project creation.
- **Store → New theme** accepts the real backend-advertised `new_theme_url`, `/admin/sites/:siteId/themes/new/editor`. The Ecommerce CMS Theme Studio creates a *private* `agentsam.theme-project.v1` draft and resolves to `/admin/sites/:siteId/themes/:projectId/editor/home?assistant=theme`. No live publication is implied.
- **Theme Studio** is the reusable packaged Ecommerce editor (sections/tree, inspector, storefront preview, native AgentSam drawer). It is *not* Design Canvas. Design Canvas may hand off source-backed stock, but must never replace the editor startup surface.

## First-run state

1. Keep the packaged Theme Studio loading skeleton while the authorized site is checked and the draft is created.
2. Mount the canonical Theme Studio editor and the existing packaged drawer, not an alternate standalone canvas.
3. Render a first-run card **inside the editor preview stage**, with directions, authorized-site inspiration, or section-by-section editing. A failed assistant connection must leave section editing available.
4. Open AgentSam and send a site/project-scoped startup request. The model may inspect *available authorized* pages, brand assets, files and documentation, but must not claim to have inspected unavailable resources. It proposes directions and asks for the intended vibe/purpose/audience; it cannot publish or modify existing pages without approval.
5. Do not retry automatic startup every time the user reloads the same draft during a session. An in-progress assistant response must not be interrupted by another option request: retain the option in the real composer for user review.

## Production source degradation

A site-owned page may include a legacy R2 `r2_bucket` identifier without an installed storage adapter. In the `inneranimalmedia` homepage, one source section currently uses a legacy bucket identifier, while other sections use the canonical `cms` bucket. This is **not** permission to fabricate an object or rewrite its R2 pointer.

The site-owned page reader should return the other valid sections, mark the unavailable section `read_only`, and expose a visible source-warning in Theme Studio. The section write path continues to reject non-canonical bucket writes. Full editing of an unavailable legacy source still requires a verified authorized storage adapter/reconnection; a degraded read is not a source migration.

## Verification

- `node --test apps/ecommerce-cms-agentsam/tests/cms-site-owned-r2.test.mjs apps/ecommerce-cms-agentsam/tests/theme-project-bootstrap.test.mjs`
- `node --test apps/local-studio/scripts/theme-start-flow.test.mjs`
- `npm run check:theme-contract --prefix apps/ecommerce-cms-agentsam`
- `npm run build:assets --prefix apps/ecommerce-cms-agentsam`
- `./node_modules/.bin/tsc -p apps/local-studio/frontend/tsconfig.json --noEmit`

These checks do not replace an authenticated production acceptance test for the site editor, generated assistant reply, or source-reconnection workflow.
