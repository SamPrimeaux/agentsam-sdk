# PrimeTech Shared Brand Icon Families v1

This is the canonical source package for the supplied PrimeTech icon-family reference.

## Identity contract

- One verified five-facet P geometry, sourced from the existing PrimeTech SVG masters.
- Eight colorways: Core Mono, Reverse, Prime Spectrum, Prime Electric, Alloy Blue, Industrial Ember, Lagoon and Technical Slate.
- Three independent shapes: transparent Bare P, filled Circle badge and filled Squircle app tile.
- 24 named icon assets; each has a color master, optical micro cut, monochrome-light and monochrome-dark sources.

## Export ladder

- Menu: 16, 20, 24, 32 px (master + mono light/dark)
- Standard: 48, 64 px (master + mono light/dark)
- Favicon: 16, 24, 32, 48, 64, 128, 256 px, SVG and multi-frame ICO
- App: 128, 180, 192, 256, 512, 1024, 1200 px
- WebP: 64, 128, 192, 512 px
- Apple touch icon 180 px; PWA 192 and 512 px

The default PrimeTech application favicon is `prime-spectrum-squircle`. Other variants remain available by stable id. The Bare P is always transparent; the checkerboard is never part of the artwork.

## Build

```sh
node packages/agentsam-brand/assets/iconography/families/primetech/v1/generate-sources.mjs
agentsam brand iconography validate --from packages/agentsam-brand/assets/iconography/families/primetech/v1/family.manifest.json
agentsam brand iconography build --from packages/agentsam-brand/assets/iconography/families/primetech/v1/family.manifest.json --out packages/agentsam-brand/dist/iconography/primetech/v1
agentsam brand iconography package --from packages/agentsam-brand/dist/iconography/primetech/v1 --out packages/agentsam-brand/dist/iconography/primetech-icon-family-v1.zip
```

The source SVGs are authoritative. Never redraw or replace the five-facet geometry with an AI-generated approximation.
