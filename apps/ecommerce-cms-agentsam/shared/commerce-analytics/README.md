# @inneranimalmedia/commerce-analytics

Reusable analytics presentation primitives for commerce/admin surfaces.

The package owns charts, KPI cards, range selection, icon primitives, and the
small formatting/type contract they require. Fuel & Free Time still owns its
route pages, API queries, business metrics, and visual shell CSS. That boundary
is intentional: app-specific analytics can progressively graduate into this
package without making the first extraction depend on Fuel & Free Time data.

Current consumer: apps/ecommerce-cms-agentsam/frontend/src/pages/analytics/.

Do not add app routing, authentication, D1 queries, or Fuel & Free Time-specific
business rules to this package.
