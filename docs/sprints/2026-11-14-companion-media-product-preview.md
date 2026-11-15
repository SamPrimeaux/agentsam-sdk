# Sprint 1 · InnerAnimal companions, Media Library and source-backed Product Studio

**Phase:** local Mac preview / user acceptance, not a released feature. **Branch:** `feat/companion-habitats-onboarding-20261114`. All Mac-origin files remain local; no R2, Stream, Images, product DB, checkout or public release was written by this sprint.

## Run locally

From the `agentsam-sdk` repository root:

```sh
npm --prefix apps/local-studio run dev:media-intake
```

The command validates and stages companion art, generates a disposable media-intake index from the Mac's existing files, extracts media previews from six selected brand ZIPs into a Git-ignored folder, discovers reusable source-owned products, and launches Vite on `http://127.0.0.1:8080`. The intake API is registered in **dev mode only** and requires `AGENTSAM_MEDIA_INTAKE=1`. It refuses non-loopback requests, disallows cross-origin file access, and never serves arbitrary URLs as file paths.

Preview routes:

- `http://127.0.0.1:8080/media/images` — image, icon, logo, atlas, sprites and concept boards
- `http://127.0.0.1:8080/media/videos` — local videos, including those inside approved archive previews
- `http://127.0.0.1:8080/media/models` — GLB and supported 3D model file types
- `http://127.0.0.1:8080/media/files` — documented archives, fonts and general files
- `http://127.0.0.1:8080/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fproducts%2Fcreate` — Product Studio; select **Templates** or **Automations**

The **Mac intake** source has collection filters: Companions & sprites, Icons & logos, Scenes & creative, 3D models and Other assets. These groups come from generated filename/path classification, not hardcoded per-asset cards; metadata is local-only until the user selects a permanent provider and publishes. Source originals are preserved. Archive preview copies are generated under `apps/local-studio/.local-media-intake/archive-previews/` (ignored by Git).

## Provenance and structural reality

- Field Operations source: `~/Downloads/InnerAnimal-Field-Operations-v1.0.0.zip`, SHA-256 in `companion.json` per character. Roux, Bruneaux, Nyra and Toro: each has 10 transparent four-frame APNG animations plus avatars, atlas and original frames, valid for local preview. Existing status briefs were merged without erasing visual direction. **Visual approval of independent articulated motions is not implied.**
- Bella v1.1.0 remains in the canonical companion package; the APNG animations use whole-character transforms of original still poses, not an articulated rig.
- PrimeTechPy remains a costume pack on `py`, not a second pet. Its artwork still requires costume-specific state slices.
- Eight habitat characters remain creative briefs and are not selectable without actual runtime media.
- Local source classification is a **preview index**, not a sellable `agentsam_products` registry. The Product Studio provides source-backed theme and workflow cards with provenance/status; real product editing, entitlement, price, installation, and publish still require the account-owned backend and productization review.
- All currently discovered GLBs are cataloged and can be opened/exported; interactive orbit/mesh inspection is not yet included in the Media Viewer.

## Local acceptance evidence

- Source archive extraction is deterministic and isolated. Manifest private paths are not returned by HTTP and never enter Git.
- The Local Studio full test command, asset tests, companion ecosystem tests, migration plan checks, both frontend typechecks, and local production-shaped build were executed successfully.
- Browser QA verified media list pages on desktop and a 390px mobile viewport, actual video controls, model file inspection, and the Product Studio source candidate cards. The localhost account registry may report a disconnected backend; the preview candidates remain visible and explicitly unregistered.

## Release boundary

**No production deployment, OAuth changes, database writes or permanent R2 imports.** After visual acceptance, the permanent media ingestion must use authorized account-scoped Cloudflare R2/Images/Stream (and model previews), retain source checksums, respect deduplication and ownership, and keep catalog metadata independent of source file paths. Source candidates need reviewed SKU, product type, thumbnails, entitlement, product/collection assignment and publish status before being advertised as products.
