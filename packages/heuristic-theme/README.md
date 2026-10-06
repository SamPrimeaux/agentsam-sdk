# @inneranimalmedia/theme-heuristic

Stock AgentSam CMS storefront shell theme. Exports a deterministic theme contract consumed by CMS presets and `theme.storefront.shell`.

```js
import { createStorefrontShellTheme } from "@inneranimalmedia/theme-heuristic";

const theme = createStorefrontShellTheme();
```

Historical gallery demos live in `apps/theme-gallery-preview` — this package owns the reusable stock contract, not donor site archives.

## Installed Heuristic Commerce theme contract

This existing SDK package now also distributes the actual Heuristic Commerce
manifest, section/block schemas, storefront runtime/CSS, and portable preset
assets from the FNF package (source: SamPrimeaux/fuelnfreetime,
`packages/heuristic-theme`). FNF remains the customer deployment and retains
its brand-specific data; this package owns the reusable template/runtime source.

Use `@inneranimalmedia/theme-heuristic/commerce/manifest` and the
`/commerce/contracts/*`, `/commerce/presets/*`, and `/commerce/storefront/*`
exports for new merchant integrations. Legacy SDK `./theme` and root exports
remain intact for existing consumers. Do not add a parallel editor or a second
Heuristic theme product to consume these resources.
