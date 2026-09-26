# AgentSam icon & motion grammar

Family system for product marks and UI glyphs. Static identity stays quiet and architectural; runtime motion (Computational Hyperspace) is spectral and dimensional — not the icon itself.

## Brand hierarchy

```text
AgentSam                         master brand
├── Local Studio                 product identity
├── CAD Creator                  product identity
├── Ecommerce                    product identity
├── CLI                          surface identity
└── future apps
```

Related without sharing the exact same icon. One recognizable **master silhouette** (abstract SAM core / aperture / dimensional mark — readable at 16–24 px). Each product adds a single cue:

| Product | Cue on master geometry |
|---|---|
| Local Studio | workspace / portal |
| CAD Creator | dimensional plane / cube |
| Ecommerce | modular product-card |

## Icon grammar

| Attribute | Rule |
|---|---|
| Base | graphite / near-black dimensional surface |
| Accent | spectral blue → violet; amber only for special active states |
| Geometry | rounded, slightly architectural |
| Detail | one dominant shape, max 2–3 secondary forms |
| Text | never in the app icon |
| Lighting | restrained edge/highlight — not glossy clip-art |
| Small sizes | simplify rather than shrink detail |
| Status icons | separate semantic system from product logos |
| Motion | slow depth/parallax; no bouncing/spinning clutter |

## Asset drop paths (desktop shell)

| Asset | Path |
|---|---|
| App / Dock / tray PNG (prefer **1024×1024**) | `packages/agentsam-desktop-shell/icons/<app_id>/icon.png` |
| Vector mark | `packages/agentsam-desktop-shell/icons/<app_id>/*.svg` |
| Manifest | `packages/agentsam-desktop-shell/manifests/<app_id>.json` → `icon_set`, `icon_mark_svg` |

Build: `cd packages/agentsam-desktop-shell && npm run build:brand -- local-studio`  
Optional: `AGENTSAM_ICON_URL=https://…/logo.png` overrides local files.

`build-brand.mjs` must honor `icon_mark_svg` when `icon.png` is missing (rasterize → `src-tauri/icons/`).

## UI glyphs (not product logos)

One semantic layer — design system picks the glyph family:

```jsx
<Icon name="workspace" />
<Icon name="terminal" />
<Icon name="activity" />
<Icon name="repository" />
<Icon name="warning" />
```

Do not mix Heroicons / Lucide / random SVGs / macOS symbols as the AgentSam brand identity. Platform-native symbols OK only for OS chrome.

## Identity vs motion

- **Static identity:** quiet / recognizable / architectural  
- **Runtime motion:** spectral / dimensional / computational (Hyperspace)

See also: `docs/plans/LOCAL-STUDIO-GRADUATION-2026-09-26.md`.
