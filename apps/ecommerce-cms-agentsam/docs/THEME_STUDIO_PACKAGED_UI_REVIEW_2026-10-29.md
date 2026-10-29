# Packaged Ecommerce CMS Theme Studio — UI-review pass

Target: the existing Fuel N Free Time packaged editor at /admin/theme-editor?slug=home.
Reference: Resolve localhost showcase at /admin/theme-editor?slug=home&showcase=resolve.

## Local visual acceptance
http://127.0.0.1:4358/admin/theme-editor?slug=home&ui_review=1

This uses the packaged frontend/static/theme-editor.html and original theme-editor.js, not Local Studio's retired IndexedDB editor. The preview server is localhost-bound and refuses CMS API writes. ui_review=1 disables Save and Publish.

## Scoped enhancements made in place
- Page dropdown searches existing authorized CMS page matches directly and retains category browsing. No new preset or automatic template creation.
- Theme Settings retains the CmsThemeSettings bridge. Additional fields for logo/favicon, page width, reduced motion, input radius, modal placement, and icon style are stored in the existing design draft object. Installed-theme rendering for these metadata keys is not yet asserted.
- App Embeds now lists the five manifest-defined types: announcement bar/popup, contact form, email subscriptions, and newsletter popup. Build-generated catalog derives from agentsam.app.json and apps/resend/agentsam.app.json.
- Right inspector preview edits copy, placement, triggers, colors, form fields, required flags, double opt-in, and modal/form validation in memory only. No installation, D1 write, email submission, provider connection or persisted embed configuration.
- Copy preview JSON is not brought into merchant UI. Resolve showcase remains independent.

## Verification and boundary
- Full Ecommerce CMS package build passes and includes UI and catalog assets.
- CMS typecheck and six contract tests pass.
- Targeted tests: 10 passed, 2 skipped due to missing jsdom on Mac. Headless Chrome aborts before rendering, so human visual inspection is necessary.
- Read-only localhost smoke: editor GET 200, catalog GET 200, CMS API POST 503.
- No production deployment, npm release, D1 migration, product presets or stock/template changes.

## Visual acceptance checklist
1. Page search and category navigation are usable.
2. Theme settings accordion is legible and accurately labels draft-only controls.
3. All five manifest embeds appear and the inspector can edit their previews.
4. Form required validation and modal previews work; close/reset actions work.
5. Sections view retains the original CMS inspector and media/save/publish flow.
After approval, implement cms_components CRUD, storefront consent/subscriber wiring, templates and stock/preset configuration.
