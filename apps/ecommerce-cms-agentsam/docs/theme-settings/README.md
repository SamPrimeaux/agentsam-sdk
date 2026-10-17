# FNF Theme Studio — October 10 implementation handoff

These documents describe the **existing reusable Ecommerce CMS code**, not a replacement theme framework. FuelNFreetime is the first tenant and hosted acceptance environment.

1. [18-panel component and interaction specification](./COMPONENT-AND-INTERACTION-SPEC-2026-10-10.md) — field keys, defaults, preview implementations, shared control geometry, keyboard/focus contracts, inheritance, tenant-safe Phase 2 backend requirements and per-category acceptance.
2. [Save / Publish / preview-header triage](./EDITOR-SAVE-PUBLISH-PREVIEW-TRIAGE-2026-10-10.md) — screenshot-grounded findings, the 900 ms private autosave and disabled-button conflict, the exact native Publish confirmation call, the dark-preview versus glass-live header discrepancy, debugging procedure, regression plan and release gates.

**Verified merchant observation:** Shop Hero media/background editing and publishing produced a changed live page. **Not verified:** identical draft/live global header rendering. **Not implemented:** persistence of the 18 new Theme Settings into D1/R2 via the toolbar Save; these controls currently hold temporary browser-session preview values.

**Next acceptance order:** 1) Make Save understandable and ready as soon as a merchant edits; 2) remove redundant native publish confirmation without changing the explicit Publish live action or draft protections; 3) reconcile /shop?preview=1 and /shop global-header rendering; 4) map the 18 Theme Settings to existing typed CMS theme/global contracts and revision lifecycle, beginning with Colors and Typography. Always publish only the actual reviewed CMS revision. Do not mark completion without hosted merchant click-through and readback evidence.
