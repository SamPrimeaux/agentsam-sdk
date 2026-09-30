# Theme package naming & storage

## Where themes live

| Kind | Path (folder) | Canonical npm id | Role |
| --- | --- | --- | --- |
| Site themes | `packages/theme-*-site/` + `packages/theme-iasf/` | `@inneranimalmedia/theme-{cypress,violet,grove,ember,forge,harbor,summit,iasf}` | Public-site CSS/content packs |
| Scenes | `packages/theme-scenes/` | `@inneranimalmedia/theme-scenes` | Composition vocabulary + registry |
| Storefront shell | `packages/heuristic-theme/` | `@inneranimalmedia/heuristic-theme` | Stock CMS shell |
| Docs skin | `packages/agentsam-docs-theme/` | `@inneranimalmedia/agentsam-docs-theme` | Docs-only tokens |
| Gallery demos | `apps/theme-gallery-preview/` | (app) | Preview only |

**Stock installable:** `iasf` (`@inneranimalmedia/theme-iasf`) — Inner Animal Storefront normalized from `studio-cms-editor` harvest. Use `agentsam-cms create my-site --starter iasf`.

**Folders may keep donor slugs for gallery/static mount compatibility.**
**Canonical product identity is neutral** (Cypress / Violet / … / IASF). Donor names are private provenance via registry `aliases[]` / `donor`.

## How to recognize / reuse

```js
import { resolveThemePackage, listThemePackages } from "@inneranimalmedia/theme-scenes/registry";

resolveThemePackage("companions"); // → violet (legacy alias)
resolveThemePackage("cypress");    // → canonical id
listThemePackages("site-theme");
```

## Host vs product

- **Host** owns Instrument Sans / Serif / IBM Plex Mono via `--font-sans` / `--font-display` / `--font-mono`.
- **Product packages** consume host tokens; provider skins (Cloudflare purple / Supabase green) stay scoped.

## Adoption rule

1. Keep existing CSS files and gallery mounts intact.
2. Prefer canonical ids for new installs/docs.
3. Legacy donor npm ids remain as aliases until remaster/publish gates complete.
