# @inneranimalmedia/agentsam-abs

AgentSam Auto Browser Shell (ABS) is the donor-staged browser system for turning a normal in-app browser into a provider-agnostic rapid development and presentation surface.

This package is being refined and approved in `SamPrimeaux/AgentSam-BrowserShell` before it is admitted to `agentsam-sdk`.

## Product contract

ABS has two browser modes:

- **Explore** — ordinary embedded web browsing, URL/search resolution, back/forward history, reload, external-open, and reference gathering.
- **Build** — AgentSam-driven generation where prompts create or revise an interactive site, generated links become new build intents, actions become revisions, and generated page history remains navigable.

The package does not own a model provider. A host supplies generation. Gemini, OpenAI, Workers AI, and local models remain host/runtime concerns.

## Runtime visualization

ABS consumes `@inneranimalmedia/agentsam-loading-scene` directly. Build work is visualized using the packaged `computationalHyperspace` preset and truthful runtime semantics. ABS does not ship a second spinner, skeleton, icon loader, or browser-specific animation engine.

## Public surfaces

```ts
import {
  AgentSamBrowserClient,
  createAbsRuntimeScene,
} from "@inneranimalmedia/agentsam-abs";

import {
  AgentSamAbsBrowser,
  AbsBuildHome,
  AbsGeneratedPreview,
  AbsRuntimeSurface,
} from "@inneranimalmedia/agentsam-abs/react";
```

Styles:

```css
@import "@inneranimalmedia/agentsam-abs/theme.css";
@import "@inneranimalmedia/agentsam-abs/browser.css";
```

## Browser sandbox

Generated HTML runs in an opaque-origin iframe with `allow-scripts allow-forms`, a restrictive CSP, an instance nonce, source validation, and a typed AgentSam bridge:

```js
window.AgentSamABS.navigate(href, label)
window.AgentSamABS.performAction(intent, payload)
```

No generated page receives same-origin access to the host.

## Theme

The approved ABS palette is packaged in `src/theme.ts` and `styles/theme.css`:

- Canvas `#090A0E`
- Surface `#101117`
- Raised `#171822`
- Text `#F7F5FB`
- Muted `#B5B1C0`
- Accent `#8B5CF6`
- Accent Soft `#B69AF8`
- Positive `#4ADE9B`

## Development gates

```bash
npm run typecheck
npm test
npm pack --dry-run
```

The donor package is not approved for SDK admission until those gates pass and the donor app is visually verified.

## Presentation tokens

```css
@import "@inneranimalmedia/agentsam-abs/theme.css";   /* tokens + components */
```

```html
<button class="as-button as-button--primary">Build</button>
<button class="as-button as-button--ghost-glass">Preview</button>
<button class="as-button as-button--subtle">Cancel</button>
```

`ghost-glass` is the elevated secondary action: white glass with a violet outline in dark,
violet glass with a white outline in light. Keyboard focus, disabled, reduced-motion and a
44px touch target are built in.
