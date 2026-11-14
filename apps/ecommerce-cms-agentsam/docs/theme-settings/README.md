# FNF Theme Studio — October 10 implementation handoff

These documents describe the **existing reusable Ecommerce CMS code**, not a replacement theme framework. FuelNFreetime is the first tenant and hosted acceptance environment.

1. [18-panel component and interaction specification](./COMPONENT-AND-INTERACTION-SPEC-2026-10-10.md) — field keys, defaults, preview implementations, shared control geometry, keyboard/focus contracts, inheritance, tenant-safe Phase 2 backend requirements and per-category acceptance.
2. [Save / Publish / preview-header triage](./EDITOR-SAVE-PUBLISH-PREVIEW-TRIAGE-2026-10-10.md) — screenshot-grounded findings, the 900 ms private autosave and disabled-button conflict, the exact native Publish confirmation call, the dark-preview versus glass-live header discrepancy, debugging procedure, regression plan and release gates.

**Verified merchant observation:** Shop Hero media/background editing and publishing produced a changed live page. **Not verified:** identical draft/live global header rendering. **Not implemented:** persistence of the 18 new Theme Settings into D1/R2 via the toolbar Save; these controls currently hold temporary browser-session preview values.

**Next acceptance order:** 1) Make Save understandable and ready as soon as a merchant edits; 2) remove redundant native publish confirmation without changing the explicit Publish live action or draft protections; 3) reconcile /shop?preview=1 and /shop global-header rendering; 4) map the 18 Theme Settings to existing typed CMS theme/global contracts and revision lifecycle, beginning with Colors and Typography. Always publish only the actual reviewed CMS revision. Do not mark completion without hosted merchant click-through and readback evidence.


## November 13, 2026 — Theme Store font catalog integration (SDK)

The installed Ecommerce CMS editor at /admin/theme-editor mounts
frontend/static/js/theme-settings-panel.js. Older references to the
review-only panel or theme-settings-live.js describe historical surfaces,
not the current editor entrypoint. Do not create another theme database
or copy the font library into the SDK.

- Font inventory, licenses, and immutable WOFF2 assets belong to
  inneranimalmedia-theme-store, delivered at
  https://themes.inneranimalmedia.com/fonts/manifest.json and
  /fonts/css?families=<approved-family-ids>.
- The CMS editor reads the manifest for Body, Subheading, Heading, and Accent.
  Existing system-font options remain usable when the catalog is offline.
- Merchant font choices are sparse overrides stored in the existing
  site-owned brand-section themeSettings.fontRoles. Each role stores
  the stable family ID and selected catalog family name; no font binaries,
  R2 object copies, or unrelated account data enter CMS settings.
- backend/cms/theme-style-contract.mjs validates selected font roles and
  generates the same stylesheet URL for the browser editor and public edge.
  The build:assets process packages the browser-served contract.
- CmsThemeSettings.update remains the existing draft and revision authority.
  Selecting a font does not publish the site automatically.
- tests/cms-theme-font-catalog.test.mjs covers manifest-backed selection,
  independent roles, reopening, reset, safe CSS generation, and actual
  site-owned draft D1/R2 readback without mutating the published object.

Boundary: this closes the catalog selection and font-role delivery slice.
It does not mean every other Theme Settings category is rendered publicly,
or that building the SDK alone deploys an installed AgentSam app.
