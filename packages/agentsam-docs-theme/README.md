# AgentSam Docs Theme

Violet skin for public AgentSam documentation (`data-asbd-skin="violet"`).

- Remaps ASBD accent aliases so shared header/footer CTAs and active states use purple.
- AgentSam Frost Blue (ASFB) glass CTA for Open Workbench (`.asbd-cta-asfb`, `--asfb` tokens).
- Repurposable promo hero (`.asbd-promo-hero`) for Learn / CAD / marketing pages.
- Purple-tinted footer on violet docs pages.
- Docs layout utilities for `/docs/sam/*` three-column guides.

Authoring SSOT for CSS lives in this package. `npm run site:sam-docs` (and `site:sync`) copies tokens into `apps/frontend/public/site/global/`.
