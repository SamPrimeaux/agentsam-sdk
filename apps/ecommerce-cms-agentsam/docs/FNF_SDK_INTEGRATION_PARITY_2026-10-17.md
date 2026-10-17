# FNF → AgentSam SDK integration parity — 2026-10-17

## Authority and merge order
- Source of truth: `SamPrimeaux/fuelnfreetime/apps/ecommerce-cms-agentsam`.
- Local FNF main fast-forwarded to `2a7a49a`; remote sync/deployment not completed.
- SDK candidate: `feat/ecommerce-cms-fnf-parity-showcase-20261016`; do not merge the entire 394-file branch without reviewing its SDK-only additions.
- Preserve the packaged app directory, not standalone duplicates of existing AgentSam/Mail/Markets/POS surfaces.

## Content parity (SHA-256 comparison, excluding dependencies/build outputs)
- FNF source: 453 files; SDK candidate: 506 files.
- Source files absent from SDK candidate: 0.
- SDK-only: 53, including preview fixture HTML/JSON and extra CMS/asset tools.
- Shared contents differing: 6:
  - `frontend/static/css/product-edit.css` (media dropzone center alignment)
  - `frontend/static/js/media-picker.js` (provider-neutral picker wording/filters)
  - `frontend/static/js/theme-editor.js` (page list fallback and SDK install behavior)
  - `frontend/static/product-edit.html` (category/help copy and controls)
  - `frontend/static/products.html` (product thumbnails)
  - `frontend/static/store.html` (store page presentation)

## Integration surface policy
- Bring over the entire existing reusable CMS/product/media/Completeful core and miniAgentSam integration.
- `/admin/home`: expose in AgentSam Local Studio/navigation; preserve the existing AgentSam shell and side assistant.
- `/admin/agentsam`: use existing `/agentsam`; do not mount a duplicate assistant interface.
- `/admin/email`: use existing `/mail`, integrate Resend app capabilities without duplicate screens.
- `/admin/scaffold?view=markets` and `?view=pos`: exclude duplicated UI entry points.
- Existing SDK Studio, backend auth, publish and tenant-specific settings are not replaced by the isolated preview server.
- Prefer host route adapters/app registry registration, not rewriting the reusable app's route names.

## Blockers and verification
1. SDK preview server currently returns HTTP 503 preview_only for general `/api/*` requests. Its supplier image response is an isolated sample, not production API proof.
2. Connect authenticated tenant context to actual Worker endpoints: D1 CMS, R2/media, products, Completeful, revisions, publish, store/pages.
3. Verify miniAgentSam and persistent Side Assistant as separate existing components; avoid building a new chat interface.
4. Verify original Theme Studio edit/save/preview/publish with a real SDK tenant, not hardcoded FNF page names.
5. Implement real template preset → editable workspace state → Save → Reopen. No general-purpose creative editor claims yet.
6. Browser QA side chat closed/open, desktop/tablet/mobile, missing assets, products/catalog, and route migrations.
7. Reconcile six frontend differences with explicit choices, then CI and deployment gates.
8. Remote GitHub status cannot be confirmed until `github.com` DNS connectivity is restored.

## Last local verification
`npm run verify:cms` in FNF package passed all six tests. Frontend build had passed on the template feature branch.
