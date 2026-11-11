# AgentSam SDK — site-owned CMS HTML publication
Date: 2026-11-10

## Authority and intended route
- Site: cms_sites.slug = agentsam-sdk, hosted at agentsam.inneranimalmedia.com.
- Page identity: cms_pages.site_id + route_path; R2 key is cms_pages.content_object_key.
- Editor: existing /admin/pages → Edit HTML source → /admin/theme-editor?slug=...&source=html&site=agentsam-sdk.
- Read/save: /api/cms/source/pages/:slug and PUT .../:slug/draft. Private R2 revision and D1 metadata optimistic version; no public mutation on save.
- Publish: POST .../:slug/publish, explicit confirm + expected_version; site can_publish required. SHA-verified immutable public R2 revision; site-scoped D1 compare-and-swap pointer; receipt retains prior version. Rollback: POST .../:slug/rollback with a fresh confirmation.
- Public read: Worker first for /, /site/*, /docs/* and /learn/*. D1 resolves site + published page; R2 WEBSITE_ASSETS is the public HTML and asset authority. Missing published R2 must never substitute an old Worker copy.
- Repo authoring copy: apps/frontend/public/site; site:sync stages assets and docs into apps/local-studio/frontend/public/site.
- site:publish publishes static non-HTML resources only. It does not bulk-overwrite CMS-owned page HTML or shared partial HTML.

## Protected existing work
- Original 26 local website/doc edits preserved at 0e77018f on feat/agentsam-sdk-cms-publishing-20261110.
- Existing private Infrastructure Cookbooks draft version 2 remains untouched in R2/D1. Never run a bulk HTML overwrite; review and publish it only through the authorized editor.

## Source verification
- 29 focused tests passed (source edit/publish/rollback, site-owned page inventory, public routing, non-HTML publishing, staging alignment).
- npm run site:sync passed, restoring canonical generated docs contents navigation.
- npm run build --prefix apps/local-studio passed, including ecommerce CMS staging and source host.
- npm run cf:verify-output --prefix apps/local-studio passed.
- npm run cf:smoke:worker --prefix apps/local-studio passed.
- npx wrangler deploy -c backend/wrangler.jsonc --dry-run passed.

## Separate live acceptance (not implied by source build)
1. Deploy source from accepted main and publish the six non-HTML extracted CSS/JS resources.
2. Confirm GET /docs/sam/infrastructure-cookbooks/ renders public CMS source rather than /settings/docs redirect.
3. Confirm /site/global/agentsam-sdk-home.css and header/footer CSS return 200 from R2.
4. Authenticate as authorized CMS site owner; open Pages, inspect a registered page, save a private HTML draft, refresh and observe it persists; publish deliberately and independently verify live HTML; rollback if needed.
5. Verify an unrelated account cannot list, save or publish the site; an editor without can_publish cannot promote.
6. Confirm site-wide header/footer partials and shared design tokens still require a separately reviewed CMS editing/publishing workflow. The present work completes *page HTML* publication, not a full visual-theme-token authoring experience.
7. Validate iPhone Safari and desktop navigation, responsiveness, and header/footer behaviors after public deployment.

No production HTML was mutated while developing these changes.
