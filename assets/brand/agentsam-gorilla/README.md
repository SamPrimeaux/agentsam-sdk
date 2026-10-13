# Gorilla AgentSam — character identity and asset usage

**Status:** selected AgentSam character direction, 2026-10-10. **Owner:** InnerAnimalMedia / AgentSam. **Kit version:** `v1` (source manifest `1.0.0`).

This is a **character system**, not just a logo. It unifies the little gorilla people recognize in the miniAgentSam composer, web/application identity, status feedback, help surfaces, and an optional desktop pet. Use one coherent silhouette, eye treatment and palette; adapt detail to the display size. See [`asset-roles.json`](./asset-roles.json) for machine-readable role-to-file pointers.

## Location and source authority

- **Preserved downloaded original:** [`source/AgentSam_Gorilla_Character_Kit_v1.zip`](./source/AgentSam_Gorilla_Character_Kit_v1.zip). Keep immutable; do not recompress, rewrite, or silently replace.
- **Expanded original assets:** [`v1/`](./v1/) — every file extracted byte-for-byte; the original kit README and `manifest.json` remain under `v1/`.
- **Integrity:** [`CHECKSUMS.sha256`](./CHECKSUMS.sha256) records all source and extracted file hashes. Check before distribution or after copying.
- **Reference preview:** [`v1/preview/index.html`](./v1/preview/index.html) and `v1/preview/character-kit-overview.png`.
- **Legacy mark preserved:** `assets/brand/AgentSam-Mark.svg` / `.min.svg`. The gorilla is the selected *mascot/character direction*; introducing it does not silently retire other approved company/product marks.

The kit's polished 3D gorilla reference is **a cropped concept image, not a native transparent 3D master**. Never upscale or describe `v1/reference/chosen-gorilla-3d-concept-crop.png` as a production master. The 2D SVGs are separate editable interpretations. The GIFs and spritesheets are early 2D animation assets, not an implemented or rigged desktop pet.

## Which asset should an agent choose?

| Surface or state | Asset relative to `v1/` | Guidance |
| --- | --- | --- |
| Source vector character | `vector/gorilla-head-master.svg` | Editable 2D foundation; don't overwrite |
| Flat character/icon | `vector/gorilla-mark-flat.svg` | Clean 2D character expression |
| Shopify-like line art | `vector/gorilla-outline-light.svg` or `vector/gorilla-outline-dark.svg` | Use contrasting variant for the background |
| Very small UI glyph | `vector/gorilla-tiny.svg` | Prefer at 16–24 CSS px; inspect actual pixels |
| Browser tab | `favicon/favicon.svg`, `favicon/favicon.ico`, `favicon/favicon-16.png` | SVG primary, ICO fallback; no scaled 3D concept crop |
| Application icon | `app-icons/agentsam-gorilla-app.svg`, `app-icons/agentsam-gorilla-app-1024.png` | App icon source/export; platform variants also present |
| macOS / Windows | `app-icons/agentsam-gorilla.icns`, `app-icons/agentsam-gorilla-windows.ico` | Use through the host platform's icon pipeline |
| miniAgentSam in-context composer | `ui/mini-composer-idle.svg` | Show near the selected editable content, not as a replacement for Inspector |
| Composer state changes | `ui/mini-composer-thinking.svg`, `ui/mini-composer-working.svg`, `ui/mini-composer-listen.svg`, `ui/mini-composer-happy.svg` | Real state -> matching icon; stable layout |
| Desktop pet — head | `pet/heads/head-idle.svg` | Optional character layer / head UI |
| Desktop pet — leaning over ledge | `pet/ledge/ledge-idle.svg` | Default desktop pet visual |
| Animation / spritesheet | `pet/animated/`, `pet/ledge/spritesheet-256.png`, `pet/ledge/spritesheet.json` | Map runtime state to authored sprite coordinates |
| Pixel-art pet variant | `pet/pixel/` | Alternative rendering family; don't mix with default 2D sprites in one motion cycle |

**State contract (visual only):** `idle` (waiting), `blink` (micro-idle), `thinking` (processing/considering), `working` (changes executing), `listen` (voice input active), `happy` (successful result), `sleep` (inactive). Bind to **actual product activity** rather than pretending operations occurred. Respect reduced-motion preferences and do not use animation as the only state indicator.

## Install into an AgentSam-owned app

1. Identify the consuming app and its **actual** static assets / native icon build pipeline; do not assume every app shares the same `public/` directory. Decide whether the surface wants *mascot*, *favicon*, *composer*, *pet*, or *official app icon*. Preserve the current mark until an authorized integration change.
2. Copy only the required role(s) from `v1/` into that app's bundled public/static directory, or add an explicit asset-pipeline reference. **Do not import artwork from a live local filesystem path at runtime.** Reference content hashes or versioned paths in deployments.
3. For ordinary web deployments with a static `/public` mount at `/`, one example is:

   ```sh
   KIT=assets/brand/agentsam-gorilla/v1
   DEST=path/to/agent-owned-app/public/brand/agentsam-gorilla
   mkdir -p "$DEST"
   cp "$KIT/favicon/favicon.svg" "$DEST/favicon.svg"
   cp "$KIT/favicon/favicon.ico" "$DEST/favicon.ico"
   cp "$KIT/ui/mini-composer-idle.svg" "$DEST/mini-composer-idle.svg"
   ```

   ```html
   <link rel="icon" type="image/svg+xml" href="/brand/agentsam-gorilla/favicon.svg">
   <link rel="alternate icon" type="image/x-icon" href="/brand/agentsam-gorilla/favicon.ico">
   ```

4. For the contextual composer, render the SVG at roughly 28–40 CSS px; provide an accessible name (`AgentSam`) on the trigger, keep the inspector selection behavior intact, and map active states to the corresponding SVG. At tiny sizes, use the `tiny` or favicon asset rather than shrinking a complex image.
5. For macOS Local Studio/Tauri, follow [`docs/brand/AGENT_SAM_ICON_GRAMMAR.md`](../../../docs/brand/AGENT_SAM_ICON_GRAMMAR.md): source app icon under `packages/agentsam-desktop-shell/icons/<app_id>/`, point the manifest `icon_set` / `icon_mark_svg` to real staged files, and run the existing `build:brand` pipeline. Do not manually overwrite generated `src-tauri/icons` without verifying its owner.
6. For hosted R2/Images, use the existing **brand/media publish pipeline** and an installation-scoped configured destination. Retain the original source asset; upload a versioned derivative and store its URL/key in the consuming app's asset configuration. **Never** bake Cloudflare credentials, account IDs, bucket names, or public hostnames into reusable SDK packages.
7. Check at 16, 24, 32, and 48px; on both light/dark backgrounds; mobile first, with keyboard/screen-reader access and reduced-motion handling. Do not swap logos or ship branding without confirming the product's brand ownership.

## Integration boundaries for agents

- **AgentSam / InnerAnimalMedia brand identity:** gorilla may be used intentionally for AgentSam-owned apps, docs, miniAgentSam and marketing. Stay consistent across chosen surfaces; don't invent disconnected gorilla silhouettes for each app.
- **Merchant/customer-neutral packages:** `apps/ecommerce-cms-agentsam` and generic CMS/theme/component libraries must remain **unbranded defaults**. FuelNFreetime or other customers choose their own tenant identities. Do not seed their sites, email templates, admin branding or favicon with the gorilla just because this kit is available in the monorepo.
- **App product icons:** a product may retain a distinctive icon or cue; the mascot is a shared character layer, not an implicit instruction to replace all icons.
- **Source fidelity:** do not recolor, flatten, replace, rename or simplify originals in `v1/`. Create an explicitly named new derivative/version and preserve provenance.
- **Legal/usage:** these are AgentSam/InnerAnimalMedia identity assets, not generic MIT-licensed sample graphics or anonymous customer placeholders. Follow the repository's `TRADEMARKS.md` and brand ownership decisions. No extra font assets are shipped.
- **What has not been done:** this import alone does not update any running app, remote R2 asset, published npm package or theme. Integrations must be implemented, tested, and released independently.

## Verify and publish changes

From this directory (works on macOS, and anywhere with `shasum`):

```sh
shasum -a 256 -c CHECKSUMS.sha256
```

From repository root after placing the kit on a feature branch:

```sh
git diff --check
git status --short
git add assets/brand/agentsam-gorilla docs/brand/AGENT_SAM_ICON_GRAMMAR.md AGENTSAM.md
git commit -m "feat(brand): preserve Gorilla AgentSam character kit and usage guide"
git push -u origin <your-feature-branch>
```

No force-push or automatic merge. Review the target app's branding before adoption. Consult `v1/README.md` for original creator notes and asset-quality limitations.
