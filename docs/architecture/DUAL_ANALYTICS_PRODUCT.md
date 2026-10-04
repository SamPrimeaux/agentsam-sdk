# Dual Analytics Product Architecture

## Non-negotiable boundary

Commerce analytics and AgentSam runtime analytics are both first-class products.

Do not collapse ecommerce into AgentSam telemetry merely because AgentSam can
measure AI cost or execute ecommerce work.

```text
                    @inneranimalmedia/analytics-ui
                   /                                                /                                @inneranimalmedia/commerce-analytics    @inneranimalmedia/agentsam-analytics
        |                                         |
revenue/orders/products/customers          runs/tools/models/GOAP
conversion/COGS/cohorts/AOV                waits/retries/cost/scores
store health + AI attribution              runtime health + priors
```

## Commerce stays commerce-owned

Examples:

- gross revenue
- orders
- average order value
- units sold
- product mix
- conversion funnel
- customer cohorts
- repeat customer rate
- pending/refunded share
- estimated COGS
- gross margin
- commerce infrastructure health
- AgentSam AI spend attributable to commerce operations

An order is not an AgentSam event.
A customer is not a model run.
Revenue is not a generic reward signal.

## AgentSam runtime analytics stays runtime-owned

Examples:

- run/tool/model events
- GOAP transitions
- verification gates
- test results
- duration
- active model time
- queue wait
- external wait
- retries
- token usage
- provider/model cost
- failure origin
- artifact references
- versioned score families

## Correlation, not collapse

The domains may correlate through stable identifiers such as:

- account_id
- tenant_id
- run_id
- receipt_id
- source_id
- dimensions.order_id
- dimensions.product_id
- dimensions.customer_id
- dimensions.campaign_id

This enables useful cross-domain questions:

- AI cost per fulfilled order
- image-generation cost per sellable product
- merchandising automation cost vs gross margin
- support-agent cost per resolved commerce incident
- test/deploy cost per storefront release

## Storage/read path

```text
meaningful AgentSam operation
        |
        v
emitAnalyticsFact()
        |
        +--> agentsam_analytics (D1 hot fact authority)
        |
        +--> AGENTSAM_ACTIVITY -> Basin -> Iceberg/Parquet
```

Commerce continues to use commerce-owned operational and aggregate sources.

UI reads stable read models, never raw tables directly.

## Visual grammar

Ember Supply remains the donor:

- light application shell
- dark analytical cards
- compact KPI row
- dense tables
- range selector
- status indicators
- sparklines
- time-series charts
- health/incident views

AgentSam surfaces:
- Overview
- Usage & Cost
- Performance
- Health
- Scores

Commerce surfaces stay intact and can grow:
- Overview
- Finance
- Health
- Merch
- Products
- Customers
- Fulfillment
- Marketing
- AI Cost Attribution

## Instrumentation law

Do not instrument every helper.

Instrument meaningful boundaries that consume:
time, tokens, paid APIs, compute, I/O, network, queue capacity, storage,
external quota, or durable state mutation.

Raw facts are evidence.
Scores are recomputable interpretations.
