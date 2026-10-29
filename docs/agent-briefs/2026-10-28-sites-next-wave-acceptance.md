# AgentSam Sites · next-wave acceptance and command handoff

Scope: existing SDK/Ecommerce console, Hosted Local Studio, and site-first CMS.
Never create a second donor editor or a parallel tenant CMS database.

## Live wave delivered

1. Hosted /sites overview no longer queries customer-only pages/page_sections.
   A disconnected account receives an honest unpublished store and a
   visually complete, responsive example (no claims of live data).
2. Browse Templates uses same-origin modal previews. Add to Drafts writes
   a private, account-scoped cms_themes record with deterministic slug and
   source package/version metadata. It does NOT install, publish or change
   an active customer theme. Verify the saved row in GET drafts before
   showing success; never silently claim the draft was created.
3. Theme Studio dropdown exposes packaged Plain Jane blog/article, Resolve
   product/collection and Violet campaign references. When previewing one,
   the editor remains preview-only until the site-first adapter is linked.
4. /admin/revise-atlas redirects to canonical Theme Studio. The unused
   standalone HTML/view was removed, while its shared section library
   runtime remains available to the real editor.
5. Settings package UI loads client-side in hosted SSR to avoid browser-only
   module execution on the server. Separate status/acceptance check for
   user-authenticated Settings remains required.

## Canonical package owners

- Site-first persisted drafts and installed themes: host CMS v2 authority.
- Shared UI: apps/ecommerce-cms-agentsam/frontend/static; packaged via
  apps/local-studio/scripts/stage-console-host.mjs.
- Hosted API auth: apps/local-studio/backend/worker/index.js.
- Store overview: apps/local-studio/backend/worker/studio-sites-overview.js.
- Draft selection: apps/local-studio/backend/worker/studio-theme-drafts.js.
- Theme source and previews: packages/theme-* and the source-derived catalog.
- Local Studio Settings UI: packages/agentsam-settings + the frontend host adapter.

## Developer commands (on your Mac)

cd ~/agentsam-sdk
git status -sb
node --test apps/local-studio/scripts/sites-nextwave-contract.test.mjs apps/local-studio/scripts/sites-catalog-contract.test.mjs
cd apps/local-studio
npm run typecheck
npm run build
npm run cf:verify-output
npm run cf:smoke:worker

Cloudflare dry-run (no production write):
npx wrangler deploy -c backend/wrangler.jsonc --dry-run

Note: cf:smoke:worker may fail with EMFILE watching the large asset tree
on this Mac even when compile and dry-run pass. Do not count that as a
runtime PASS. Run actual hosted /sites + /settings/general checks and a
signed-in browser acceptance pass.

## Next gates

- Confirm Settings 200 with a signed-in user, and save/read settings.
- Confirm Add twice gives one private theme draft in cms_themes, scoped to
  the current user. Do not publish it.
- Replace editor's read-only source preview with a verified site binding,
  definitions, page sections, blocks, settings schema and transactional save.
- Add draft page creation based on the package's real page manifest;
  customer D1 only after tenant/site selection and backup.
- Audit actual host schema vs customer CMS schemas before any migration.
- Verify responsive layouts, contrast and keyboard interaction on device.
- GitHub Mac credentials: repair/re-authenticate before pushing to main.
