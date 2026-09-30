# @inneranimalmedia/theme-iasf

**IASF** (Inner Animal Storefront) — stock, installable commerce/editorial theme.

Normalized from `studio-cms-editor` harvest lane `theme_layout_donor` into a portable package:

- catalog content (`products`, `archetypes`, `journal`)
- CSS tokens + `styles/storefront.css`
- `createIasfStarterPackSeed()` for CMS first-run (`agentsam-cms create … --starter iasf`)

## Usage

```js
import { createTheme, createIasfStarterPackSeed, readStorefrontCss } from '@inneranimalmedia/theme-iasf';

const theme = createTheme(); // installable: true, id: iasf
const starter = createIasfStarterPackSeed();
```

Canonical id: **`iasf`**. Aliases: `inneranimals-site`, `theme-inneranimals-site`.
