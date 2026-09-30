# Theme package naming & storage

## Where themes live

| Kind | Path | npm name | Role |
| --- | --- | --- | --- |
| Site themes | `packages/theme-<site>-site/` | `@inneranimalmedia/theme-<site>-site` | Real public-site CSS/content packs |
| Scenes | `packages/theme-scenes/` | `@inneranimalmedia/theme-scenes` | Composition vocabulary (shell/blocks) |
| Storefront shell | `packages/heuristic-theme/` | `@inneranimalmedia/heuristic-theme` | Stock CMS shell contract |
| Docs skin | `packages/agentsam-docs-theme/` | `@inneranimalmedia/agentsam-docs-theme` | Docs-only tokens |
| Gallery demos | `apps/theme-gallery-preview/` | (app, not a theme package) | Preview only |

**Do not delete or flatten these packages.** Built CSS and existing imports stay authoritative.

## How to recognize / reuse

Canonical short ids are registered in `packages/theme-scenes/src/registry.js`:

```js
import { resolveThemePackage, listThemePackages } from "@inneranimalmedia/theme-scenes/registry";

resolveThemePackage("companions"); // → theme-companions-site entry
listThemePackages("site-theme");
```

Aliases map informal names (`fuelnfreetime`, `companions-of-caddo`) → stable package names **without renaming directories**.

## Host vs product

- **Host (Local Studio)** owns Instrument Sans / Instrument Serif / IBM Plex Mono via `--font-sans`, `--font-display`, `--font-mono`.
- **Product packages** consume host tokens (and optional product accents). They must not hardcode Inter or another global type system.

## Adoption rule

1. Keep existing `packages/theme-*` CSS files intact.
2. Add aliases in the registry when a name is hard to recognize.
3. Only rename a package when a deliberate migration updates all imports + gallery + CMS activations together.
