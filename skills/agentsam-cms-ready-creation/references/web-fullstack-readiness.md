# Web/app/commerce full-stack proof requirements

## Real frontend

Use source-backed components, real responsive constraints, selection and
inspector bindings, accessible forms, deliberate typography, hover/focus,
transitions with reduced-motion support, and real page/artboard previews.

## Real content and commerce

Plan reusable templates and content schemas. Describe dynamic product,
collection, cart, search, filtering, customer and merchandising behaviors
using the **authorized existing** CMS/commerce contracts. Connect data
only when appropriate backends and grants are present. Never inject demo
products, fake inventory counts, imaginary prices or personal account data
as if sourced from a merchant.

## Real backend

For each data-changing action, prove route, schema, actor identity,
authorization, idempotency/revision checks, failure semantics and persistence.
Keep secrets server-side and use host-owned adapters. A generated component
that merely renders a button does not count as a finished workflow.

## Readiness and release check

- A clean new Canvas can be created without a site or theme.
- Its source survives save, reload, revision conflict and reopen.
- Visual design and logic are inspectable and editable before conversion.
- Optional CMS mapping is validated with an explicit report.
- Conversion into a **private** CMS draft retains the independent Canvas.
- The resulting draft can be opened in the real host theme editor.
- Publication is separately approved and verified; a draft never writes the
  live customer site.
- Unauthorized user, duplicate create, lost connection, missing asset,
  interrupted save, canceled generation and unsupported mapping are tested.

Treat unmet items as gaps; do not label the artifact production-ready.
