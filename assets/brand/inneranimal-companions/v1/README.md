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
- **Field Operations:** Roux, Bruneaux, Nyra, Toro. These four character directions were approved. The original animation packages are now imported and verified (10 transparent APNG states / 40 frames each). Their media is available in localhost preview and the public Kingdom archive, but this does not independently publish them as installable runtime products.

The eight habitat additions (Pelican, Crawfish, Gator, Chameleon, Lyrebird, Tree Frog, Bat, Badger) are full creative/profile briefs, not falsely advertised as runtime-ready artwork. Collectible access is metadata only; checkout and entitlement enforcement are not wired yet. Their manifests define roles, visual direction, signature motion, capabilities, and the shared 10-state animation contract.

## Runtime and storage contract

Runtime art remains under `assets/brand/inneranimal-companions/v1/<id>/` and is mirrored into Local Studio public assets by `apps/local-studio/scripts/stage-inneranimal-companions.mjs`. The canonical character manifests do not name a storage provider; the **separate, derived public catalog** below owns its delivery URLs.

## Public Companion Kingdom media collection

The public asset library is in Cloudflare R2 bucket `brand`, which is served by `https://brand.inneranimalmedia.com`. The content is a **publicly readable collection of proprietary InnerAnimalMedia assets**, not an open redistribution license. Its discoverable entrypoints are:

- [Habitat-first media explorer](https://brand.inneranimalmedia.com/companions/kingdom/v1/explore.html)
- [Current version pointer](https://brand.inneranimalmedia.com/companions/kingdom/latest.json)
- [Character/habitat/story catalog](https://brand.inneranimalmedia.com/companions/kingdom/v1/index.json)
- [Immutable media inventory](https://brand.inneranimalmedia.com/companions/kingdom/v1/assets.json)

Launch publication includes **1,014 unique media objects**, five habitat documents, separate character/lineage documents, 52 existing source JSON metadata documents, plus the historic Geaux, Meaux, Coder, Architect, Engineer, Py, Bella, Field Operations, Gorilla and Explore artwork. The publisher hashes the media and collapses **byte-identical** duplicates, but it does not collapse meaningful frames, GIF previews, source editions, storyboard concepts, or variants. Legacy images remain visibly labeled as editions, not promoted to approved runtime assets. Planned character briefs stay planned.

Run `python3 scripts/publish-companion-kingdom.py` to create a **local dry-run** plan. Run `python3 scripts/publish-companion-kingdom.py --publish` with authorized `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in the operator environment (Python `boto3` required) to perform a resumable publish. The script writes only derived manifests and content-addressed originals to the `companions/kingdom/v1/` prefix, updating `latest.json` only after every media upload succeeds. On subsequent publishes it reads the public R2 manifest and preserves verified historic cloud-only media even when their original Mac Downloads archives are absent, so a new workstation cannot accidentally erase old editions from the catalog. Do not commit credentials or local intake indexes. Raw downloaded archives are not exposed as ZIP downloads; their curated media is extracted and published without private files, unrelated project QA screenshots, or personal photos.

**Public R2 delivery is separate from runtime installability and account-specific Media Library registration.** The original Local Studio Mac-intake preview remains read-only, while the public Kingdom explorer is browseable without local account login.

## Companion experiences

- Four-question **Discover Your InnerAnimal** quiz selects from the existing selectable family and persists the match in the existing account preferences JSON.
- **Geaux → Bella** handoff provides a strategy-to-execution duo transition.
- Optional second-companion desktop status buddy consumes the `agentsam:companion:status` event contract. The shell currently emits work-started and runtime-idle; test-pass, syntax-warning, and blocked signals are defined for the test runner/language-server producers but are not yet connected.
- Milestone unlock definitions are catalogued, but verified GitHub/runtime metrics and unlock persistence are not yet wired. Habitat collection keys and `included` / `collectible` access modes are metadata only; checkout and entitlement enforcement are not wired.
- Agency/B2B companion briefs reuse the existing custom companion creation path and add brand/commission context.

New profile manifests are intentionally non-selectable until their full transparent animation assets, avatars, and runtime validation are present.
