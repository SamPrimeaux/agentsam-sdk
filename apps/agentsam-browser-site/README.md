# AgentSam Browser — public site

Private workspace app. Consumes the real `@inneranimalmedia/agentsam-abs` browser and the
`@inneranimalmedia/agentsam-sections` page kit.

```bash
npm install
npm run build:packages
npm run dev:browser-site          # http://localhost:4180
npm run build:browser-site        # static output: apps/agentsam-browser-site/dist
```

Page generation here is a local preview host: it returns a canned page, needs no provider key,
and never calls a model. Attach a rate-limited AgentSam runtime by replacing `usePreviewHost`
in `src/LiveBrowser.tsx`; the browser UI does not change.

Media for the sections lives in `public/media` and `public/previews`.


## Real product preview

The site does not create a replacement mini-demo for a product that already runs.

Set VITE_SHOWCASE_APP_URL to any real app URL and Section 02 loads that app
directly in the reusable sandboxed media slot. If the variable is omitted, the
section stays an honest static poster instead of inventing fake app behavior.

Local example:

    VITE_SHOWCASE_APP_URL=http://localhost:3000 npm run dev:browser-site
