# Gorilla AgentSam — Character Kit v1.0

Production-oriented **2D vector** and raster assets for the selected Gorilla AgentSam identity, plus an **animated desktop-pet starter kit**.

## Start here

- **Brand-quality reference of the selected design**: `reference/chosen-gorilla-3d-concept-crop.png` (cropped from the approved comparison artwork; source resolution ~193px and scaled for preview, **not** a native transparent master)
- **Editable SVG master**: `vector/gorilla-head-master.svg` and `vector/gorilla-head-happy.svg`
- **Shopify-style outlines**: `vector/gorilla-outline-light.svg`, `vector/gorilla-outline-dark.svg`
- **Browser favicons**: `favicon/favicon.ico`, `favicon/favicon.svg`, and PNGs from 16 to 512px
- **App / Dock icons**: `app-icons/` with SVG, PNGs, `.icns`, Windows `.ico`
- **MiniAgentSam composer**: `ui/mini-composer-idle.svg` and idle/happy/thinking/working/listen variants
- **Pixel pet option**: `pet/pixel/` includes 64px pixel versions, 256px nearest-neighbor exports, GIF, and mapped spritesheet.
- **Desktop pet**: `pet/heads/`, `pet/ledge/` (source SVG + PNG), animated GIFs in `pet/animated/`, and `pet/ledge/spritesheet-256.png` with mapping JSON
- **Preview**: open `preview/index.html` locally to compare artwork and pet states.

## Asset quality and caveats

The **2D SVG artwork is actual editable vector code**, so use it directly or rasterize at any size. Icons have been rendered at real output dimensions. The tiny/favicon variant is deliberately simplified to avoid unreadable details.

The original polished 3D gorilla existed in a **concept board**, not as a high-resolution transparent isolated render. The enclosed crop is therefore in `reference/`, not misrepresented as a native 3D source or production-ready 1024px master.

The pet animation GIFs are **working first-pass animations** from the 2D character. They include blink / small bob and basic state switching, not a fully rigged pet, 3D model, nor a desktop app. The spritesheet JSON provides frame coordinates for implementing those states in Tauri or Web.

## Suggested installation

- Web favicon: `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` with `/favicon.ico` fallback.
- Embedded mini composer: use `ui/mini-composer-idle.svg` at 28–40 CSS px; swap to `working` / `thinking` by app state. Don't rely on tiny PNGs for scaling.
- AgentSam app icon: use `app-icons/agentsam-gorilla-app.svg` or platform-specific assets.
- Desktop pet: run a transparent always-on-top native Tauri window with a click-through idle mode and a draggable interaction surface; keep its behavior opt-in and configurable. The enclosed spritesheet provides starter states.

## Color tokens

`night #0B0A18`, `purple #753CF8`, `lilac #AE72FF`, `lightFur #EAE6FF`, `mask #151426`

## Naming

Character: **Gorilla AgentSam**. Product name: **AgentSam**. The pet can use its own nickname later; no rename is baked into assets.
