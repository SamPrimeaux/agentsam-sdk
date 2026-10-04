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
