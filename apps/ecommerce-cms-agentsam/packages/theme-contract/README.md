# Theme Contract v1

This contract is the boundary between customer content and visual implementation.

A customer owns content, products, collections, media, navigation, and publishing state. A theme owns visual renderers, presets, default compositions, tokens, motion, and supported section or block capabilities. Changing a theme must not duplicate customer store data.

## The model

Global site layout

Header section group
- settings
- navigation blocks
- announcement
- theme-specific presentation

Template main region
- ordered section instances
- each instance has a stable id, semantic section type, visual preset, settings, blocks, and bindings
- a template controls which section types are allowed and its default composition

Footer section group
- brand settings
- navigation and support groups
- newsletter
- policies and social
- theme-specific presentation

## Artifact levels

Component

A reusable rendering primitive. Components do not own page ordering or customer persistence. Examples include action buttons, media frames, product cards, price displays, badges, navigation items, and modal shells.

Section definition

A reusable merchant-editable composition. It defines semantic type, renderer, fields, allowed blocks, presets, capabilities, and default values. One section definition may have many visual presets.

Section instance

A customer-owned use of a section inside a template. It stores stable id, semantic type, chosen preset, enabled state, settings, blocks, and references to external authorities.

Template definition

A page-kind composition contract. It names a layout, allowed section types, and default section composition. It does not copy product, collection, media, or navigation records.

Layout definition

The outer site frame. It defines the Header group, main template region, Footer group, width or safe-area behavior, and any global slots.

Theme package

A versioned bundle of layouts, templates, section definitions, components, tokens, assets, renderers, and presets. Heuristic, Revise, and FNF are visual packages over the same customer content.

## Non-negotiable data rule

Theme documents may reference products, collections, media, navigation, inventory, customers, and other domain authorities. They do not copy those records into theme state.

Bindings use explicit source plus ref or query. A renderer receives resolved data through an adapter.

## Stable identity rule

Section and block instance ids survive theme changes. A visual theme maps the semantic type and customer fields into one of its supported presets. If a theme cannot render a semantic section type, the editor must show the incompatibility instead of silently deleting or flattening the section.

## Import pipeline for old HTML and previous builds

The future ingestion pipeline converts donor work in stages:

1. Capture the source artifact and assets without editing it.
2. Detect global layout regions, page templates, repeated section boundaries, repeated components, and data dependencies.
3. Classify each region by semantic type rather than by donor filename or CSS class.
4. Extract editable values into fields and repeated children into blocks.
5. Replace hardcoded product, collection, media, navigation, and customer data with bindings.
6. Extract visual variations as presets instead of cloning section definitions.
7. Produce a contract candidate plus renderer adapter.
8. Render the candidate against fixture content and compare it visually with the donor.
9. Run responsive, accessibility, reduced-motion, and interaction tests.
10. Only after the candidate is proven does it enter the reusable section, template, component, or layout library.

The output of ingestion is never another standalone demo project. The output is a contract artifact that the Theme Studio can list, preview, edit, and compose.

## Proof requirement

An artifact is reusable only when it has:
- a validated contract
- a renderer
- an editor schema
- a representative fixture
- responsive proof
- persistence proof when used as an instance
- at least one real host consuming it

A screenshot, HTML file, isolated route, or package with no host integration is a donor, not a finished product.

## Portability enforcement: new brand test

For all changes to the reusable Theme Studio core:

1. Core modules must not import an F&FT-specific UI, image, logo, hardcoded copy, or domain.
2. The host supplies content, theme registrations, rendering adapters, domain bindings, and allowed capabilities.
3. The core preview registry lives at `packages/theme-contract/runtime/theme-preview-registry.js`; F&FT visual preview adapters live separately at `packages/fnf-theme/src/editor/preview-adapter.js`.
4. Another brand registers a named theme and renderer with `ThemeStudioPreview.register({ id, name, catalog, render })`. The editor lists it without rewriting the editor or changing its persistence model.
5. All merchant operations must eventually pass the same test through the packaged editor, not a brand-specific rewritten dashboard.
6. The brand-specific example is not a universal default. Anything under a customer package can be tailored to that customer; shared core code cannot.

**Current milestone limitation:** Theme switching currently demonstrates visual previews. Native renderer parity, publishing a new theme, rollback, and fully portable editor distribution are still launch blockers. Do not describe this milestone as a finished white-label CMS or as reusable package publication.
