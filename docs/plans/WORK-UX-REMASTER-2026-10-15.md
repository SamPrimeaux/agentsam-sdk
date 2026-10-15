# Work UX Remaster — acceptance checklist

Scope: hosted Projects/Tickets, the shared packages/agentsam-work UI, and apps/local-studio desktop. Mobile iOS usability is the primary acceptance criterion. No second theme or independent implementation.

## Implemented on UX branch

- [x] Desktop portfolio with a project index, selected timeline and inspector, connected to real Work ticket/project records.
- [x] Keep the native mobile Projects catalog, shared navigation dock and existing CRUD actions.
- [x] Planned dates versus observed ticket activity are separate and clearly labeled; no invented deadlines.
- [x] Actual Fit scaling, 6-week and 2-week zoom, more legible status colors, progress fill, project labels.
- [x] Three actionable focus tickets replace duplicated long recommendations; dependency chains disclosed on demand.
- [x] Compact mobile Tickets filtering: search and one Filters control.
- [x] Project detail: perceived completion, shipped-ticket share with honest labeling, blockers and next actions.
- [x] Remove nested timeline tabs and nonfunctional right Work rail; default desktop navigation to collapsed.
- [x] Expanding long ticket titles and compact mobile project actions.
- [x] Fix Artifacts and virtual shell HTML preview paths to use the existing stylesheet/script assembler.
- [x] Label unstyled unnamed HTML fragments without altering original file contents.
- [x] Eight-surface fixture screenshot harness for mobile 390x844 and desktop 1440x900 with overflow checks.

## Must verify before declaring production-grade

- [ ] Final rendered screenshot review after the last mobile header changes.
- [ ] Authenticated iPhone Safari tests: tap, keyboard, scroll, save/reopen and screen reader labels.
- [ ] Installed desktop app sign-in, edit ticket/project, then confirm same account-owned D1 rows on web.
- [ ] CI pixel-diff baseline review and performance test with 666 tickets and 39 projects.
- [ ] Persistent Milestones with acceptance evidence, not inferred ticket completion.
- [ ] Versioned reusable Templates, saved filters and portfolio-level phases/dependencies.
- [ ] Canonical legacy project mapping and priority normalization without silently overwriting original data.

## Parallel work, not merged into this UX branch

- [ ] Cold-start Keychain read trace, minimal reads, safe migration plan, stable signing for trusted builds.
- [ ] Validate user-pushed Superbash branch with agentsam doctor, self-service tool discovery, version provenance and cross-repository capability certification.
- [ ] SDK version parity and release train for IAM, MCP and Local Studio; signed-in desktop uses hosted D1 as authority.
- [ ] Apple Developer signing/notarization and auto-updater publication.

## Evidence

Use apps/local-studio npm run build:desktop and npm run smoke:work-visual, plus packages/agentsam-work tests and worker data tests. The local QA screenshots are in Downloads/agentsam-work-visual-review (fixtures, not customer data). A clean build is not an authenticated production acceptance test.

## Release receipt — 2026-10-15

- PR #216 merged to main as 16d3f4a0, from UX remaster commit 6bc0a81a.
- Production Cloudflare Worker agentsam-sdk deployment succeeded with version c1fbcfe5-d895-4546-841c-bd48aebf187b.
- Live unauthenticated checks: /projects HTTP 200, /tickets HTTP 200, /api/work/snapshot HTTP 401 as expected without identity.
- Tauri desktop app bundled on Apple Silicon from the merged source, ad-hoc signed with successful local code-signing verification. ZIP: ~/Downloads/AgentSam-Local-Studio-UX-Remaster-16d3f4a0-macOS-arm64.zip (29 MB). Archive integrity passed; SHA-256 800a84a5652a18e6ccaa4647a5fd4f6164a65e8a98ca1029082f1a0f7c1ae4a8.
- NOT notarized or published via auto-updater. Authenticated iPhone Safari and installed-desktop cross-host CRUD acceptance not yet completed. Keychain multi-prompt issue remains unchanged.
- Independent Superbash branch/worktree was inspected but not edited, merged, published or reset by this release.
