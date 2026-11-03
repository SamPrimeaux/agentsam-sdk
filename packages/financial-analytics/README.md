# @inneranimalmedia/financial-analytics

Universal, capability-driven financial analytics for merchants, SaaS products,
and service businesses. It defines reusable metrics and a small presentation
component; hosts retain ownership of transactions, credentials, queries, and
tenant policy.

selectFinancialMetrics(capabilities) chooses only metrics supported by
connected sources. The read model distinguishes available, empty, and
unavailable; consumers must not replace missing sources with zeroes.

The package does not assume a store, order system, payment processor, chart of
accounts, or Cloudflare account. Commerce is one possible source family, not an
owner or a prerequisite. FinancialMetricDeck reuses analytics-ui primitives
and is presentation-only.

Cloudflare runtime counts and custom Workers Analytics Engine events are not
invoice-aligned charges. Only a billing source that returns billed usage should
claim cloud_billing and expose cloud_billed_cost.
