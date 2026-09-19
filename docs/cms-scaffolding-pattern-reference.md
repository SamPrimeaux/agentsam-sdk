# CMS scaffolding pattern reference — sections/blocks/schema

_Reference captured 2026-09-18; reconciled against current SDK tree 2026-09-19._

The pattern worth copying isn't a framework, it's a separation: reusable sections and blocks with a typed schema, page composition as pure data (templates), and an editor UI generated automatically from each section or block's schema — never hand-built per section or block. Every tool below implements this same separation differently; this doc tracks how, so agentsam-sdk's version can be compared against them as it's built.

## The core pattern

Shopify's [theme architecture](https://shopify.dev/docs/storefronts/themes/architecture) is the cleanest real-world example of the separation worth copying. Six primitives, each with one job:

| Primitive | Job | Who edits it |
| --- | --- | --- |
| Layout file | Repeated shell (header/footer) every page renders inside | Developer |
| Template (JSON) | Which sections appear on a page, in what order — pure data, no markup | Merchant, via editor |
| Section group | Container letting merchants add/remove/reorder sections in fixed zones (header, footer) | Merchant |
| Section | A reusable, self-contained module with its own `{% schema %}` block defining its editable fields | Developer writes it, merchant configures it |
| Block | A repeatable sub-item inside a section (one testimonial card inside a testimonials section) | Merchant |
| Snippet | Small reusable code partial, invisible to merchants, no schema | Developer only |

The part that matters most: **a section's schema is what generates its settings panel in the editor.** Nobody hand-builds a settings UI per section — the editor reads the schema and renders the right inputs (text field, image picker, color swatch, range slider) automatically. Add a new section with a new schema and the editor already knows how to edit it.

## How the leading tools implement the same pattern

Every modern visual builder is solving the same problem Shopify solved — register a section or block once, get its editor UI for free — with a different registration API and a different ownership model.

| Tool | Registration call | Schema lives | Editor UI | Code ownership |
| --- | --- | --- | --- | --- |
| [Shopify (Dawn)](https://shopify.dev/docs/storefronts/themes/architecture) | `{% schema %}` tag at the bottom of a `.liquid` section file | Inside the section file itself | Auto-generated from schema, zero custom UI code | Hosted — themes only run on Shopify |
| [Plasmic](https://docs.plasmic.app/learn/registering-code-components) | `PLASMIC.registerComponent(Component, meta)` | JS object passed at registration (`props` field) | Auto-generated panel in Plasmic Studio from `meta.props` | Can generate/export React code into your own repo |
| [Makeswift](https://docs.makeswift.com/developer/docs/reference/makeswiftruntime/reactruntime/register-component) | `runtime.registerComponent(Component, { type, label, props })` | `props` object, values are "Controls" (`Style`, `TextInput`, etc.) | Panel built from the Controls you pass per prop | Runs inside your own Next.js codebase |
| [Builder.io](https://www.builder.io/c/docs/input-types) | `Builder.registerComponent(Component, { name, inputs })` | `inputs` array, each with a `name` + `type` (string, color, richText, object, list…) | Auto-generated from `inputs`, same input-type system also drives their headless CMS data models | Hosted headless CMS; components live in your repo |
| [Webstudio](https://github.com/webstudio-is/webstudio) | Not confirmed against a cited source — don't take this as a specific API to copy | Not confirmed against a cited source | Visual canvas editor | Verified: fully open source, self-hostable — you own data, components, and infrastructure |

The pattern is identical across the sourced rows: **schema → editor UI writes itself.** The only real axis of difference is who owns the runtime — Shopify and Builder.io are hosted platforms you build on top of; Plasmic and Makeswift let the component code live in your own repo, which is closer to what agentsam-sdk needs, though the portable core still can't be React-specific (see below).

## Gap check: where our current setup stands

The real gap isn't "we don't have this pattern" — IAM already has most of it. The real gap is that it's owned by IAM, not portable, and not consistently used. That authority split is the actual problem to solve.

| Pattern element | In IAM | In SDK | Notes |
| --- | --- | --- | --- |
| Section/block registry + schema | Yes | Partial | `apps/client-cms-editor` now consumes section/block schema catalogs and exposes registry-backed section/block/template UX, but canonical schema authority is still supplied by the host/backend rather than owned as a portable SDK registry |
| Data-only page composition | Partial | Partial | `apps/client-cms-editor` models and consumes structured Page → Section → Block data; what's still missing is portable authoritative storage, a versioned template/publication manifest, and renderer convergence between editor preview and publish |
| Auto-generated editor UI | Partial | Partial | `apps/client-cms-editor/frontend/src/CmsEditor.tsx` has a schema-driven `ContentInspector` that reads registry field definitions and renders controls from them, but it still depends on host/backend-supplied schemas rather than an SDK-owned portable registry |
| Debug/schema metadata isolated from public render | Historical gap | Re-verify | The 2026-09-18 `/work` audit found `route:` / `section:` / `cms:` strings rendering visibly. Treat that as historical evidence to regression-test, not as a claim about the current deployed renderer without a fresh probe. |

**Storage law**, once extracted: D1 holds identity, relationships, ordering, lifecycle, structured state, and artifact pointers. R2 holds media, imported source, generated HTML, and heavy/versioned artifacts. KV holds only current-publication/cache pointers and invalidation — never identity or source of truth.

The honest read: the Dawn zips are raw material (real, tested HTML patterns worth mining for section ideas), not architecture to extend as-is — they predate the schema concept entirely. IAM's CMS core is a different case: the registry/schema authority exists, and the SDK now contains `apps/client-cms-editor` with Page → Section → Block modeling plus schema-driven inspector controls. What's still missing is portable ownership of that authority and renderer convergence. That's the extraction problem, not an invention problem.

## Target blended pattern for agentsam-sdk

What to take from each:

- **From Shopify** — the schema-in-the-definition convention (a section or block ships its own field definitions) and the strict split between layout / template-as-data / section / block. This is the skeleton, and it already exists in IAM's registry — it needs extracting, not inventing.
- **From Plasmic** — the registration call shape, as a reference for ergonomics only. The portable core can't be React-specific, since the Worker and public runtime must not be forced to ship React just to render a page.
- **From Makeswift** — the idea of typed "Controls" per field carrying their own validation, options, custom widgets, and conditional behavior — not just a type string. The current `apps/client-cms-editor` inspector already selects controls from schema field definitions; richer validation, options, conditional behavior, and portable control metadata remain the gap.
- **From Builder.io** — the unified input-type system spanning both components and data models, so the same schema vocabulary describes a section/block's fields and a content model's fields — one type system, not two.
- **From Webstudio** — the ownership stance: open-source, self-hostable, infrastructure-ownable — the business owns data/components/infrastructure outright. Non-negotiable given the resale plan.

The portable contract is **schema + renderer key/adapters + optional editor-control overrides** — not "React component + schema." A section or block definition is: a versioned schema (fields, types, defaults, motion settings), a renderer key the Worker and public runtime resolve to a deterministic renderer, and optional editor-control overrides for the React-based editor specifically. That's what lets React power the editor without forcing the Worker or public runtime to ship React at all.

AgentSam doesn't need to invent this pattern. The current SDK already has the client CMS editor surface and schema-driven inspection; IAM still owns more of the canonical registry/schema authority. The remaining work is extraction and convergence: move portable authority into shared SDK contracts, bind schemas to deterministic renderer keys/adapters, keep every editor panel schema-driven, and package the result with local and Cloudflare host adapters.

## Sources

- [Shopify theme architecture](https://shopify.dev/docs/storefronts/themes/architecture)
- [Shopify Dawn reference theme](https://github.com/Shopify/dawn)
- [Plasmic — registering code components](https://docs.plasmic.app/learn/registering-code-components)
- [Plasmic — code components API reference](https://docs.plasmic.app/learn/code-components-ref)
- [Makeswift — registerComponent reference](https://docs.makeswift.com/developer/docs/reference/makeswiftruntime/reactruntime/register-component)
- [Builder.io — custom component input types](https://www.builder.io/c/docs/input-types)
- [Webstudio](https://github.com/webstudio-is/webstudio)
