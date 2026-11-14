# InnerAnimal companion ecosystem · v1

The canonical catalog now separates **runtime-ready companions**, **approved artwork awaiting import**, and **greenfield character briefs**. Habitat membership is metadata, not a duplicate character identity. Each habitat also has a stable collection key and an `included` or `collectible` access mode so future unlock/store packaging can attach without duplicating pet profiles.

## Runtime-ready family

Geaux, Meaux, Coder, Architect, Engineer, Py, Bella, Roux, Bruneaux, Nyra, and Toro are eleven selectable local-preview profiles. Geaux remains the default. Their existing runtime assets and visual-review status are preserved.

## Py costume expansion

**PrimeTechPy** is a ten-direction scientist / creative-tooling add-on for the existing `py` identity. It is a costume pack, not a new pet. Its manifest is under `py/costume-packs/primetechpy/`; the reference sheet still needs local ingestion and frame slicing before runtime release.

## Habitat expansions

- **Bayou & Gulf:** Geaux, Meaux, Bella, Pelican, Crawfish, Gator.
- **Deep Canopy:** Chameleon, Lyrebird, Tree Frog.
- **Night Shift:** the existing Architect owl, Bat, Badger. Architect is reused; no duplicate owl identity is created.
- **Field Operations:** Roux, Bruneaux, Nyra, Toro. These four character directions were approved. The original animation packages are now imported and verified (10 transparent APNG states / 40 frames each). They are available in localhost preview and are not published releases.

The eight habitat additions (Pelican, Crawfish, Gator, Chameleon, Lyrebird, Tree Frog, Bat, Badger) are full creative/profile briefs, not falsely advertised as runtime-ready artwork. Collectible access is metadata only; checkout and entitlement enforcement are not wired yet. Their manifests define roles, visual direction, signature motion, capabilities, and the shared 10-state animation contract.

## Runtime and storage contract

Runtime art remains under `assets/brand/inneranimal-companions/v1/<id>/` and is mirrored into Local Studio public assets by `apps/local-studio/scripts/stage-inneranimal-companions.mjs`. The manifests do not name an R2 bucket or storage provider.

## Companion experiences

- Four-question **Discover Your InnerAnimal** quiz selects from the existing selectable family and persists the match in the existing account preferences JSON.
- **Geaux → Bella** handoff provides a strategy-to-execution duo transition.
- Optional second-companion desktop status buddy consumes the `agentsam:companion:status` event contract. The shell currently emits work-started and runtime-idle; test-pass, syntax-warning, and blocked signals are defined for the test runner/language-server producers but are not yet connected.
- Milestone unlock definitions are catalogued, but verified GitHub/runtime metrics and unlock persistence are not yet wired. Habitat collection keys and `included` / `collectible` access modes are metadata only; checkout and entitlement enforcement are not wired.
- Agency/B2B companion briefs reuse the existing custom companion creation path and add brand/commission context.

New profile manifests are intentionally non-selectable until their full transparent animation assets, avatars, and runtime validation are present.
