# AgentSam Ecommerce + CMS

Fuel & Free Time is customer #1 and the first paying purchaser of
@inneranimalmedia/ecommerce-cms-agentsam. It is not a donor project.

This F&FT repository is the first production customer installation of the
product. The app owns the shared navigation renderer and contextual inspector.
React mounts content through a portal into the same shell used by CMS, product
editor and media pages. The public shell and inspector are generated mirrors.

Customer-specific brand identity, products, media, campaigns, credentials and
provider selections belong to the F&FT installation. Reusable application
capabilities belong to @inneranimalmedia/ecommerce-cms-agentsam.

## Theme packages

The current customer storefront uses the local
@inneranimalmedia/heuristic-theme. Additional themes are additive packages,
not replacements for customer data.

The first packaged alternate theme is @inneranimalmedia/revise-theme, backed by
@inneranimalmedia/site-contracts and
@inneranimalmedia/section-library. The ecommerce CMS is responsible for theme
registration/selection and for passing normalized customer content into the
selected theme.

App-local commands:

    node apps/ecommerce-cms-agentsam/bin/agentsam-ecommerce.mjs info
    node apps/ecommerce-cms-agentsam/bin/agentsam-ecommerce.mjs doctor
    node apps/ecommerce-cms-agentsam/bin/agentsam-ecommerce.mjs preview
    node apps/ecommerce-cms-agentsam/bin/agentsam-ecommerce.mjs scaffold /outside/empty-directory

The package exposes the top-level ecommerce executable when installed or linked. SDK registration uses agentsam.app.json and its bin. The SDK app already has a separate preview executable; do not blindly replace its host adapter. This workspace-source package must travel with its runtime source to scaffold.

Scaffolds exclude credentials, local state, customer seeds and unrelated scripts. They retain sample storefront branding. Each owner provisions resources and provider accounts. Doctor checks source presence, not deployment readiness. See ecommerce-cms-agentsam.md for release gates.
