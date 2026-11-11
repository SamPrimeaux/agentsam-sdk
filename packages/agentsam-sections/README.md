# @inneranimalmedia/agentsam-sections

Reusable page kit under the standardized `mxs-*` theme: global header / footer,
scroll-driven split sections, and one media slot for image, gif, video, glb and
sandboxed interactive app previews.

```tsx
import { MxsHeader, MxsSection, MxsFooter } from '@inneranimalmedia/agentsam-sections';
import '@inneranimalmedia/agentsam-abs/theme.css';        // optional: tokens (--as-*)
import '@inneranimalmedia/agentsam-sections/mxs.css';
```

## Media kinds

```tsx
{ kind: 'image', src, alt }
{ kind: 'gif',   src, alt }
{ kind: 'video', src, label, poster? }                    // plays in view, pauses out of view
{ kind: 'model', src, alt, poster?, loadViewer }          // .glb via <model-viewer>
{ kind: 'app',   src, title, poster? }                    // sandboxed iframe, click to launch
```

`model` needs the host to supply the viewer so the kit has no hidden dependency:

```ts
// host app: npm i @google/model-viewer
const loadViewer = () => import('@google/model-viewer');
```

Keep `loadViewer` at module scope so its reference is stable.

## Motion

`useMxsScroll` writes one CSS variable (`--mxs-p`, 0 → 1) per section while it is near the
viewport. CSS maps it to enter / hold / exit for text and media. No re-renders on scroll,
and `prefers-reduced-motion` pins everything visible.

## Theme

`mxs.css` reads `--as-*` tokens when present (light/dark via `data-theme`) and falls back to
neutral values when used standalone.

## Design invariant: inverse glass chrome

For themes that use glassmorphic global chrome:

- dark/deep page surfaces use a light frosted header/footer
- light page surfaces use a purple/dark branded glass header/footer

The mxs-chrome semantic tokens own this behavior. Individual pages should not
override header/footer colors directly.

## Product previews

Do not rebuild a fake demo when the advertised product already has a runnable
surface.

Use:
- component media to mount the real React/package product directly
- app media to load a real deployed/local application URL
- image/gif/video/model only when those formats are the product asset itself or
  when a runnable preview is not appropriate

App media supports autoLaunch when the host wants the live app visible
immediately rather than gated behind a poster click.

## Storefront Forms, Inbox and Grow components

Import `StorefrontForm`, `OnlineStoreChat`, and `OnlineStoreChatFields` from this
package and `@inneranimalmedia/agentsam-sections/storefront-embeds.css` for the
scoped styles. Place the controlled chat settings in the editor's left rail.
Persist settings with the host's existing site-owned draft operations. Pass
published settings to the theme layout once, outside page sections, for
a single launcher across the storefront. Filter featured products through the
host's site-owned published catalog.

The host supplies `SubmitStorefront` for the three submission kinds. Resolve the
site and installed embed on the server, enforce the published configuration,
validate/rate-limit input, and return a real receipt only after durable acceptance.
An optional absent transport disables submissions. Contact and inbox submit
customer requests. Signup carries explicit marketing consent separately and
supports a confirmation-required receipt. No campaign sends are triggered here.
