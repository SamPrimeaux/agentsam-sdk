# Ecommerce CMS as an installed Local Studio App

**Product:** `@inneranimalmedia/ecommerce-cms-agentsam`

**Reference experience:** the actual Ecommerce app whose local preview is
`127.0.0.1:4387`, served from the CAD/CMS parity showcase worktree. The
versioned `frontend/static/store.html` and `frontend/shell.js` sources on
the SDK release baseline have identical SHA-256 hashes to that reference.

## Authority boundaries

- `apps/ecommerce-cms-agentsam/agentsam.app.json` owns product identity,
  packages, extension registration and generic `embed.build`.
- `backend/lib/route-manifest.js` owns Ecommerce routes. Local Studio only
  checks launch eligibility; it does not redefine or reimplement admin pages.
- `packages/agentsam-desktop-shell/manifests/local-studio.json` controls
  installed applications in the existing Studio build; CAD Creator and Ecommerce
  both use the same generic builder.
- `/sites` is the host entry for connected websites. Selecting a Worker-backed
  site with edit access opens the **whole admin application** at
  `/apps/ecommerce-cms-agentsam?site=<authorized-site-slug>`.
- Worker-backed `/cms` links also open Ecommerce, while local draft theme
  projects and other CMS-only sites retain their existing authoring route.
- The mounted interface loads the installation's OWN Worker origin for
  `/admin/store`. Its API, orders, inventory, CMS publishing, media and
  providers remain installation-owned. The host does not impersonate the
  Ecommerce API or remount a customer database onto the platform Worker.
- `/apps/ecommerce-cms-agentsam?preview=local` is an explicit loopback-only
  development view of port 4387. There is no production fallback to that port.

## App-owned routes (functional coverage)

- `/admin/home`, `/admin/orders`
- `/admin/products`, `/admin/products/create`,
  `/admin/products/help/artwork`, `/admin/product-edit?id=<product>`
- `/admin/inventory`, `/admin/subscribers`, `/admin/growth`,
  `/admin/content`
- `/admin/analytics/overview`, `/admin/analytics/finance`,
  `/admin/analytics/health`
- `/admin/store` (host `/sites` entry)
- `/admin/pages`, `/admin/theme-editor?slug=<dynamic-page>`,
  `/admin/preferences`

The host does **not** register scaffolded Markets/POS or a second
`/admin/agentsam`; the AgentSam product stays at the host's existing
`/agentsam`. The Ecommerce Worker still owns its navigation code, so
removing embedded-menu items inside that UI needs a separate product-shell
polish; host-route exclusion alone does not remove links from an iframe.

## Real integration gates

1. `node --test apps/local-studio/scripts/ecommerce-app-host.test.mjs
   apps/local-studio/scripts/build-included-apps.test.mjs`
2. `npm --prefix apps/ecommerce-cms-agentsam run build`
3. `node apps/local-studio/scripts/build-included-apps.mjs`
4. `npm --prefix apps/local-studio run build:dev`
5. In a signed-in Studio installation, select a Worker-backed site on
   `/sites`; verify actual project ownership and all app routes against
   its Worker. Ensure iframe permissions/CSP and authentication are configured
   for the installed application's origin. When embedded framing is blocked,
   use the **Open full window** action.
6. Before npm shipment, install the independently versioned Ecommerce product
   and rerun the generic build without relying on SDK source-only aliases.

The staged files in `frontend/public/ecommerce-cms-agentsam` are the real
packaged UI assets. Static files on their own do not represent an operational
business-data backend. The Worker remains the application authority.

Customer sites are **installations of the same product code**, each with
their own resources. No Fuel & Free Time data, credentials, theme or identity
is a product default.
