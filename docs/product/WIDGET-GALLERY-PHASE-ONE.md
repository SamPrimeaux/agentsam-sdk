# Widget Gallery — Phase One

Date: 2026-10-06
Target: Hosted/desktop Local Studio → Settings → Customize → Widgets

## Completed implementation

- The Workbench widget registry now exports `WIDGET_GALLERY_DEFINITIONS` with 22 unique, curated entries based on the preserved widget demo taxonomy.
- `BUILTIN_WIDGET_DEFINITIONS` remains exclusively the set of *working, packaged renderers*. It still contains Countdown only.
- The portable Settings contract accepts optional widget category, tags, availability, and proposed package ownership.
- Local Studio supplies all 22 definitions to the **existing** Settings host (not a new competing gallery route).
- Settings provides an adaptive preview gallery, category chips, search, detail sheet, and accurate Ready/Concept states.
- Preview artwork is sample-only and clearly labeled; it never claims to be connected data.
- Demo widgets are not installed, routed to nonexistent implementations, persisted as enabled utilities, or allowed to invoke mutations.
- The existing Countdown can still be shown/hidden and opened from Utilities.

## Intentional boundaries

This is **catalog/presentation graduation**, not runtime integration:

- The 21 demo designs do not yet have canonical Workbench renderers/data/action adapters.
- Domain packages do not yet export `./widgets` contributions.
- D1 catalog/installations/layout/preferences are not accessed or modified in this phase.
- No demo runtime API calls, provider credentials, approvals, or simulated authority were copied into the production widget runtime.
- The staged recursive `npm pack` verifier on the separate donor-graduation branch is left untouched.
- npm `2.6.12` is immutable; these source changes require a subsequent package release before SDK consumers receive them.

## Verified

- Contracts, Workbench, and Settings build and pass their tests.
- Workbench asserts 22 unique catalog entries / 1 runnable / 21 preview-only.
- Local Studio checks that demo entries are hidden from Utilities and cannot be enabled.
- Hosted and desktop Local Studio production builds complete.
- Frontend TypeScript typecheck completes.
- Interactive visual QA at 390px confirms no document overflow, 22 cards, Agent & Runtime filter = 5 cards, and Cloudflare search = 1 card.

## Next graduation slice

1. Fix and merge donor packaging/quarantine verification safely, with no recursive `prepack`.
2. Move the actual high-quality donor widget visuals into reusable Workbench renderers, beginning with utility widgets.
3. Add typed widget contribution/adapter contracts and register a first real domain widget (Queue Depth).
4. Reconcile the existing widget D1 migration tracking before authenticated persistence writes.
5. Only mark additional widgets Ready after a genuine data adapter, renderer, safety tests, and independent consumer test pass.
