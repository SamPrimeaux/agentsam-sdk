# InnerAnimalMedia source-mined platform presets — 2026-11-12

This is a **versioned intake into the existing Ecommerce CMS**, not a new library app, theme engine, page registry or R2-hosted HTML renderer.

- Seven original owner-supplied HTML sources were decomposed into nine semantic definitions / ten preset configurations.
- The authoritative normalized intake manifest is [iam-20261112.preset-pack.json](./iam-20261112.preset-pack.json).
- Existing D1 system catalog entries were reused for the IAM header, footer, loading states and four case-study sections. Only sign-in, sign-up and globe loader needed new SKUs.
- Existing `cms_definitions` rows were reused for the four case-study sections, and new **draft** definitions were created for global/navigation, auth and app loading semantics.
- All presets expose typed settings, defaults, optional blocks, data binding requirements, and source SHA-256 values.
- The original snapshots, extracted script-free reference fragments, styles and unpacked globe topology are stored in the owner's permanent source archive. These are **references only**, not installed executable code.

## Data ownership

- `cms_component_templates` — distribution-level stock preset/configuration and picker metadata (system rows).
- `cms_definitions` — semantic contract, versioned editor schema, allowed blocks (currently installed/account-scoped).
- `cms_components` — **only** verified renderer implementations. None were falsely registered or promoted by this intake.
- `cms_globals` — actual installed site header/footer; `cms_page_sections` and `cms_section_blocks` — installed page content; no instance content created by the intake.
- Site-specific design tokens remain site/theme-owned; account/dashboard `cms_themes` should not be confused with storefront design.
- Auth endpoint/session/OAuth and redirect enforcement stays in the host auth service; no source-auth JS is published.

## Distribution gate (especially for future accounts)

Catalog rows are `is_system=1`. Future accounts can discover the typed preset configuration without copying the original owner's site data. **Installation remains gated on an implemented and verified renderer plus account-local definition resolution.** Current CMS runtime must not treat a source preview, markup fragment or an active catalog row as proof a renderer is installable.

## Remaining release acceptance

Implement/verify the matching `cms_components` renderer **in the existing CMS runtime**, then link it to the standard Shopify-parity Add Section/Block picker or Global/Auth/UI surface. Verify:

1. Catalog discovery as a second account, correct placement and allowed blocks.
2. Live renderer and keyboard/mobile/reduced-motion behavior against reference images.
3. Real create → edit → private-save → reload → publish → restore workflow.
4. Site isolation, asset/menu bindings and source provenance.

No production pages, globals, installations or released storefronts were changed by the intake.
