# @inneranimalmedia/theme-scenes

Reusable **scene / shell / block** vocabulary for branded website experiences.

| Layer | Owns |
| --- | --- |
| `@inneranimalmedia/agentsam-brand` | BrandPack — assets, tokens, roles, delivery |
| **`@inneranimalmedia/theme-scenes`** | How brands compose into experiences |
| Page content | What this page says/shows |
| Demo adapters | Real product surfaces inside scenes |

Scenes never hardcode CDN URLs, nav hrefs, or product copy. They consume `SECTION_CONTENT`, route refs, and asset roles.

## Install

Workspace package (private for now):

```js
import {
  createWorkPreset,
  compilePage,
  createCopyBlock,
  createActionBlock,
  composeCardCollection,
} from '@inneranimalmedia/theme-scenes';
```

## Hierarchy

```
PAGE_CONTENT
  └── SECTION_CONTENT[]   → scene kind + theme + scroll + motion
        └── SECTION_GROUP[]
              └── CONTENT_BLOCK[]   copy | media | action | cards | demo | …
```

## Scene kinds (harvested from Work/Create HTML)

| Former HTML piece | Scene / shell |
| --- | --- |
| Sticky glass headers | `shell.adaptive-header` |
| Dark / light globe heroes | `hero.scroll-product` / `hero.editorial` + `visual.orbital-field` |
| Light→dark gradient | `bridge.theme` |
| Brand storyboard lanes | `gallery.storyboard` |
| Icon marquee | `gallery.rail` (loop is one *behavior*) |
| Service bento | `capability.grid` |
| MeauxIDE mock | `product.demo` + `agentsam-mini-composer` |
| MeauxSQL card | `product.demo` + `database-editor` |
| Staggered tools | `product.stack` |
| Chess / 3D stage | `interactive.stage` |
| Footers | `shell.site-footer` |

See `SCENE_ORIGIN` in `src/scenes/index.js`.

## Laws

1. No raw colors in scene contracts — use theme tokens / CSS vars.
2. No hardcoded internal URLs — use `{ type: 'route', ref: '…' }`.
3. No direct CDN URLs — use `{ assetRole: '…' }` + BrandPack resolver.
4. No product copy inside generic scenes — inject via groups/blocks.
5. No required card counts — empty collections disappear; adaptive layout.
6. Major media slots support image / video / model / demo.
7. Animated scenes declare reduced-motion behavior.
8. Scenes declare theme intent (`surface`, `headerTone`, …).
9. Product marketing uses real DemoAdapters, not fake UIs.
10. Motion must communicate something (story/scrub), not decorate forever.

## Quick example

```js
import {
  createWorkPreset,
  createCopyBlock,
  createActionBlock,
  createDemoBlock,
  composeCardCollection,
  compilePage,
} from '@inneranimalmedia/theme-scenes';

const page = createWorkPreset({
  theme: 'inneranimal',
  heroGroups: [{
    blocks: [
      createCopyBlock({
        variant: 'display',
        eyebrow: 'Selected Work',
        title: 'Interface clarity.\nSystem discipline.',
        body: 'Digital products with refined UI and production-grade foundations.',
      }),
      createActionBlock({
        label: 'View the system',
        target: { type: 'route', ref: 'product.agentsam' },
      }),
    ],
  }],
  agentsamGroups: [{
    blocks: [
      createCopyBlock({ title: 'AgentSam', body: 'Unified workspace shell.' }),
      createDemoBlock('agentsam-mini-composer'),
    ],
  }],
  productGroups: [{
    blocks: [
      composeCardCollection([
        { title: 'Database', body: '…', target: { type: 'route', ref: 'product.database' } },
        { title: 'Cloud', body: '…', target: { type: 'route', ref: 'product.cloud' } },
      ]),
    ],
  }],
});

const plan = compilePage(page);
// plan.sections[].demoHost, plan.cssVars, plan.validation
```

## Presets

- `agency-home` — institutional flagship narrative  
- `work` — Work page (dark or canvas hero via `heroTone`)  
- `product` — single product landing  
- `services` — capability grid  
- `brand-story` — Create/guideline storyboard  

```js
import { createPreset, listPresets } from '@inneranimalmedia/theme-scenes';
```

## Themes

`foundation` → `inneranimal` → `agentsam` / `autodidact`

Semantic tokens only (`color.surface.canvas`, `type.display.xl`, …). `themeToCssVars()` emits `--scene-*` for hosts.

## Scroll presets

| Mode | Typical | Purpose |
| --- | --- | --- |
| `natural` | content height | ordinary |
| `viewport` | ~100vh | focused statement |
| `linger` | 120–160vh | visual + copy |
| `sticky-story` | 180–260vh | narrative scrub |
| `cinematic` | 240–320vh | flagship product |
| `bridge` | 40–80vh | world transition |

Hosts receive normalized `progress` 0→1 (`computeScrollProgress` / `stageAtProgress`).

## Demo adapters

| Adapter | Product surface |
| --- | --- |
| `agentsam-mini-composer` | AgentSam / MiniComposer |
| `database-editor` | MeauxSQL-class DB editor |
| `cad-viewer` | GLB turntable |
| `generic-iframe` | last-resort embed |

## Studio (next)

Reusable `studio-shell` (navigator / canvas / inspector) sits *above* this package. Moon Glass mock → Brand Studio panels over BrandPack + theme-scenes — not another one-off HTML page. See AgentSam BrandPack README for the compiler side.

## Tests

```bash
npm --prefix packages/theme-scenes test
```
