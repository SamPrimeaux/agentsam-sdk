# AgentSam Ecommerce + CMS

A reusable, multi-tenant commerce and website CMS application. Customer identity, catalog, media, campaigns, credentials and provider selections are supplied by account- and site-scoped CMS records and connected services; they are not baked into the application package.

The app owns the merchant navigation renderer, Page Editor, Theme Studio, site-scoped persistence and storefront delivery. Reusable CMS capabilities belong to this application and its shared contracts; storefront theme source belongs to `inneranimalmedia-theme-store`.

## Theme packages

The CMS does not bundle a storefront theme library. Theme Store is the source of truth for installable themes and release assets. The CMS reads Theme Store catalog/release metadata and stores installed, editable site projects in its existing D1/R2 CMS primitives.

First-run site creation uses the customer-neutral `backend/cms/site-starter-preset.mjs` seed to scaffold editable Home, Shop and About pages. That seed is not a theme package or a copy of a customer storefront. Theme package identity remains `@inneranimalmedia/theme-heuristic` and is versioned by Theme Store.

App-local commands:

    node apps/ecommerce-cms-agentsam/bin/ecommerce.mjs info
    node apps/ecommerce-cms-agentsam/bin/ecommerce.mjs doctor
    node apps/ecommerce-cms-agentsam/bin/ecommerce.mjs preview
    node apps/ecommerce-cms-agentsam/bin/ecommerce.mjs scaffold /outside/empty-directory

The package exposes the top-level ecommerce executable when installed or linked. SDK registration uses agentsam.app.json and its bin. The SDK app already has a separate preview executable; do not blindly replace its host adapter. This workspace-source package must travel with its runtime source to scaffold.

Scaffolds exclude credentials, local state, customer seeds and unrelated scripts. They retain sample storefront branding. Each owner provisions resources and provider accounts. Doctor checks source presence, not deployment readiness. See ecommerce-cms-agentsam.md for release gates.

Collection ownership, explicit migration and reusable starter illustration behavior: [Collections](docs/collections.md).
