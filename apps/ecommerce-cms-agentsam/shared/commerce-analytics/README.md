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

## Dual analytics product boundary

Commerce analytics remains first-class. This package is not being replaced by
AgentSam runtime analytics.

Shared visual grammar may be harvested into
`@inneranimalmedia/analytics-ui`, but commerce keeps ownership of revenue,
orders, AOV, units, product mix, customers/cohorts, conversion, COGS, margin,
store health, and AgentSam AI cost attributable to commerce work.

AgentSam runtime analytics owns runs, tools, models, GOAP, waits, retries,
runtime cost, failures, and score families.

Correlation is explicit through stable IDs instead of schema collapse.
