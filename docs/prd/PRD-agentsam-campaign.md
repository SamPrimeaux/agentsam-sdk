# AgentSam Campaign
## Product Requirements Document

**Package:** `@inneranimalmedia/agentsam-campaign`  
**Product form:** Installable AgentSam plugin  
**Status:** Experimental  
**Primary hosts:** ChatGPT, AgentSam Local Studio, compatible MCP hosts  
**Sibling plugin:** AgentSam Brand

---

# Product vision

AgentSam Campaign is an evidence-driven campaign intelligence system.

It helps users decide:

> **What should we do right now to achieve a measurable business, marketing, audience, or growth objective?**

The product should move beyond generic marketing generation by grounding campaign decisions in real context and then learning from actual outcomes.

Its job is not merely to produce campaign ideas.

Its job is to help users:

```text
understand
→ strategize
→ compare
→ plan
→ execute through appropriate capabilities
→ measure
→ learn
→ improve
```

---

# Product promise

> **Plan, evaluate, coordinate, measure, and optimize performance-driven campaigns using real brand, audience, commercial, channel, and historical evidence.**

AgentSam Campaign should be meaningfully more valuable than asking a generic model:

> “Give me ten marketing ideas.”

Its advantage should come from knowing the user's actual operating context.

---

# Core user questions

AgentSam Campaign should be able to help answer:

- What campaign should we run next?
- What objective should we optimize for?
- Who should we target?
- Which audience segment is most promising?
- What should the campaign say?
- Which products or collections should it feature?
- Should we run a promotion?
- Should we discount?
- What offer is commercially reasonable?
- What SEO/search opportunity exists?
- Which channels fit this campaign?
- What creative variants should we test?
- What content is required?
- Which concept is strongest and why?
- What assumptions are we making?
- What evidence supports the recommendation?
- What happened after we launched?
- What performed?
- What failed?
- What should we do differently next time?

---

# What Campaign is not

AgentSam Campaign is not:

- AgentSam Brand;
- a brand-identity generator;
- a giant CMS;
- a product manufacturing engine;
- a product catalog authority;
- an ad network;
- a generic commerce API;
- a generic analytics dashboard;
- a guarantee of revenue;
- a guarantee of SEO ranking;
- an autonomous unlimited-spend marketing system.

Campaign composes other capabilities where appropriate.

---

# Relationship with AgentSam Brand

AgentSam Brand and AgentSam Campaign are sibling plugins.

Brand answers:

> **Who are we?**

Campaign answers:

> **What should we do now with that identity to produce a measurable result?**

Campaign can consume:

```text
BrandContract
approved voice
visual rules
canonical assets
brand principles
approved extensions
```

as campaign context.

Brand fit becomes one campaign-evaluation dimension.

It is not the entire campaign strategy.

Campaign can create tactical variation within approved brand territory.

If a campaign requires a new durable brand expression, Campaign should request or propose a Brand extension rather than silently redefining the brand.

---

# Campaign lifecycle

The canonical Campaign lifecycle is:

```text
CONTEXT
   ↓
OBJECTIVE
   ↓
AUDIENCE
   ↓
HYPOTHESIS
   ↓
CONCEPTS
   ↓
EVALUATION
   ↓
PLAN
   ↓
APPROVAL
   ↓
EXECUTION
   ↓
MEASUREMENT
   ↓
LEARNING
```

The product should preserve this structure as durable state where appropriate.

---

# Campaign context

Campaign should build an explicit picture of available evidence.

Possible context sources include:

```text
brand
products
collections
inventory
price
COGS
margin
historical orders
traffic
conversion
audience/customer segments
search data
existing content
existing media
campaign history
channel history
campaign outcomes
seasonality
operational constraints
budget constraints
```

Campaign does not require all of these.

It must explicitly identify:

```text
available
missing
stale
inferred
estimated
unsupported
```

context.

---

# Graceful degradation

## Basic context

```text
brand
+ products/services
+ campaign objective
```

Campaign can:

- generate campaign hypotheses;
- create concepts;
- propose messaging;
- develop preliminary audience strategy;
- identify required content;
- suggest channels;
- identify missing information.

Confidence should remain appropriately limited.

## Commercial context

```text
basic context
+ pricing
+ COGS
+ margin
+ inventory
```

Campaign can additionally:

- evaluate offers;
- evaluate discount feasibility;
- prioritize products;
- reason about inventory;
- consider margin impact;
- develop better merchandising recommendations.

## Performance context

```text
commercial context
+ analytics
+ historical orders
+ customer segments
+ campaign history
+ channel outcomes
```

Campaign can additionally:

- use actual behavioral evidence;
- compare concepts against previous performance;
- identify stronger segments;
- detect fatigue;
- identify winning or losing patterns;
- make better channel decisions;
- create more meaningful hypotheses.

Missing data must never be replaced by invented evidence.

---

# Campaign objectives

Campaign should support objectives such as:

```text
awareness
traffic
acquisition
conversion
product launch
collection launch
SEO / organic acquisition
promotion
retention
reactivation
cross-sell
upsell
average-order-value growth
inventory movement
email signup
audience growth
engagement
education
event promotion
partner / creator campaign
```

The selected objective materially changes evaluation.

A strong awareness campaign is not necessarily a strong direct-conversion campaign.

---

# Audience intelligence

Campaign should support:

- target audience definition;
- existing-customer segments;
- acquisition audiences;
- behavioral segments;
- lifecycle stages;
- product affinity;
- geographic or seasonal relevance where data permits;
- channel-specific audiences;
- exclusion criteria;
- known versus inferred audience attributes.

Campaign should not fabricate customer demographics when no evidence exists.

---

# Campaign briefs

The CampaignBrief should capture:

```text
objective
target audience
business context
brand context
products / services
campaign type
problem / opportunity
core hypothesis
message
offer
channels
timing
constraints
success metrics
evidence
assumptions
unknowns
```

Initial public operation:

```text
campaign.brief.draft
```

Persisted briefs should remain distinguishable from drafts created only for conversation.

---

# Campaign concepts

Campaign should normally generate multiple strategic directions where appropriate.

A CampaignConcept may contain:

```text
name
strategic idea
campaign hypothesis
audience
message
hook
product / collection focus
offer strategy
SEO/search angle
channel fit
creative direction
content requirements
expected strengths
risks
evidence
assumptions
```

Concepts are strategic alternatives.

They are not merely alternative taglines.

---

# Campaign evaluation

`campaign.concept.evaluate` should evaluate concepts against meaningful performance dimensions.

Potential dimensions include:

```text
objective_fit
audience_fit
brand_fit
message_strength
search_opportunity
offer_strength
channel_fit
historical_evidence
conversion_evidence
commercial_viability
margin_fit
inventory_fit
seasonality
creative_feasibility
execution_cost
measurement_quality
evidence_quality
```

Scoring requirements:

1. Every score must have supporting factors.

2. The system should distinguish observed facts from inferred judgments.

3. Missing evidence should affect confidence.

4. Scores must not pretend to predict guaranteed outcomes.

5. Users should be able to understand why one concept outranks another.

---

# Concept ranking

`campaign.concepts.rank` should compare concepts transparently.

Example output:

```text
Concept A
Strongest conversion evidence.
Moderate creative burden.
Strong inventory fit.

Concept B
Strongest Brand fit.
Weak prior channel evidence.
Excellent organic-content opportunity.

Concept C
Highest search opportunity.
More expensive to execute.
Commercial assumptions remain unresolved.
```

The goal is informed decision making.

Not artificial certainty.

---

# Promotion intelligence

Campaign should treat promotion as broader than discounting.

Campaign promotion may include:

- launches;
- seasonal moments;
- limited releases;
- bundles;
- customer reactivation;
- loyalty;
- product education;
- product-led promotion;
- collection storytelling;
- partnerships;
- creator collaborations;
- organic search;
- email;
- social;
- paid media;
- storefront promotion;
- landing-page promotion.

A valid Campaign recommendation may be:

> **Do not discount this campaign.**

Offer decisions should consider available evidence.

---

# Offer intelligence

Campaign may evaluate:

```text
discount
bundle
gift with purchase
free shipping
limited availability
early access
exclusive access
product assortment
cross-sell
upsell
value-added offer
no promotional incentive
```

Offer evaluation may consume pricing, cost, margin, inventory, and historical conversion data.

Campaign should not mutate commerce state simply because it recommended an offer.

---

# SEO and search intelligence

SEO is a first-class Campaign performance dimension.

Campaign may reason about:

- search intent;
- topic demand;
- product or collection search opportunity;
- organic acquisition strategy;
- query-to-offer fit;
- landing-page strategy;
- campaign topic clusters;
- competitive positioning where authorized evidence exists;
- search-oriented messaging;
- internal content requirements;
- organic versus paid interaction;
- SEO measurement.

Possible Campaign output:

```text
campaign.seo.plan
```

The SEO plan may request work from Content Studio.

Campaign does not need to become the canonical metadata editor.

Campaign must never guarantee rankings.

---

# Channel planning

Campaign should evaluate available channels rather than automatically recommending every channel.

Potential channels:

```text
website
landing page
storefront
email
organic social
paid social
search
organic search
creator
affiliate
partner
community
retargeting
direct outreach
```

Channel recommendations should consider:

```text
objective
audience
historical performance
available content
cost
measurement capability
operational capacity
```

---

# Experimentation

AgentSam Campaign should be built to test hypotheses.

A CampaignExperiment may include:

```text
hypothesis
control
variant
changed factor
audience
channel
measurement
minimum evidence requirement
expected observation window
result
learning
```

Examples:

```text
message A vs message B
discount vs no discount
utility angle vs lifestyle angle
new audience vs existing audience
search landing page A vs B
hero product A vs B
```

Experimentation gives Campaign an improvement loop rather than making each campaign a disconnected event.

---

# Creative requirements

Campaign owns the strategic requirement for creative.

For example:

```text
1 collection hero
3 product detail treatments
2 acquisition social variants
1 retention email hero
1 search landing page
3 short video concepts
```

Campaign may also specify:

```text
message
audience
format
channel
objective
required brand extension
variant hypothesis
```

Actual asset production may be delegated to:

```text
AgentSam Brand
AgentSam Content
media/image capabilities
other creative plugins
```

---

# Merchandising

Campaign may reason about:

- which products to feature;
- assortment;
- hero products;
- product ordering;
- bundles;
- cross-sell;
- upsell;
- launch assortment;
- inventory pressure;
- campaign-specific collections.

Campaign does not become the canonical catalog or manufacturing authority.

Its job is the strategic merchandising decision.

---

# Campaign plan

`campaign.plan` should transform the approved strategy into coordinated work.

A CampaignPlan may contain:

```text
objective
audience
hypothesis
products
offer
message
SEO/search strategy
channels
creative requirements
content requirements
merchandising requirements
timeline
dependencies
approvals
measurement plan
success metrics
risks
assumptions
```

Plans should be portable.

They should not assume FNF, Shopify, Completeful, Cloudflare, or any specific provider.

---

# Execution boundary

Campaign planning and campaign execution are separate capabilities.

Initial Campaign should prioritize:

```text
read
understand
draft
evaluate
rank
plan
save
```

Later:

```text
prepare
launch
measure
review
optimize
```

Actions that mutate external systems must require:

- appropriate scope;
- explicit authorization;
- approval where required;
- idempotency;
- receipts;
- structured failure behavior;
- post-write verification where possible.

---

# Measurement

Campaign must eventually connect planning to results.

Measurement may include:

```text
impressions
traffic
clicks
engagement
conversion
orders
revenue
AOV
margin
new customers
returning customers
email actions
search performance
channel cost
acquisition cost
inventory movement
```

Not every campaign needs every metric.

The relevant metrics derive from the objective.

---

# Campaign outcomes

A CampaignOutcome should distinguish:

```text
planned objective
planned hypothesis
observed data
attribution confidence
unexpected outcomes
successful elements
unsuccessful elements
unresolved questions
```

Observed facts should not be rewritten as model interpretation.

Both should be preserved separately.

---

# Campaign learnings

`campaign.review` / `campaign.learnings` should produce reusable knowledge.

Examples:

```text
Utility-focused messaging outperformed lifestyle messaging
for first-time visitors.

Discounting increased conversion but materially reduced
contribution margin.

Organic search produced slower initial traffic but higher
purchase intent.

Existing customers responded more strongly to collection
storytelling than urgency.
```

Learnings must retain provenance and confidence.

They can inform future campaigns.

They should not automatically become permanent Brand rules.

---

# Performance loop

The defining system loop is:

```text
campaign history
      ↓
new objective
      ↓
context
      ↓
hypothesis
      ↓
concepts
      ↓
evaluation
      ↓
campaign
      ↓
measurement
      ↓
outcome
      ↓
learning
      ↓
future campaign
```

AgentSam Campaign should become better grounded as a workspace accumulates actual evidence.

---

# Initial public MCP surface

Keep the public surface intentionally compact.

Existing:

```text
campaign.get_context
campaign.brief.draft
campaign.concept.evaluate
campaign.concepts.rank
campaign.plan
campaign.brief.save
campaign.concept.save
```

Recommended near-term additions should be driven by proven user workflows rather than namespace completeness.

Likely internal/package capabilities include:

```text
campaign.audience.evaluate
campaign.offer.evaluate
campaign.seo.plan
campaign.channel.plan
campaign.experiment.plan
campaign.performance.evaluate
campaign.review
campaign.learnings
```

Not every package function needs to become a public MCP tool.

The public tools should remain recognizable user-level operations.

---

# Skills

Recommended Campaign plugin skills:

```text
campaign-strategy
campaign-brief
campaign-concept-development
campaign-concept-review
promotion-planning
seo-campaign
offer-review
channel-planning
campaign-experiment
campaign-performance-review
```

Each skill should define:

- activation conditions;
- minimum context;
- preferred evidence;
- tool sequence;
- missing-data behavior;
- approval behavior;
- expected output;
- direct examples;
- indirect examples;
- negative/out-of-scope examples.

---

# UI

Campaign should work without custom UI.

UI should be reserved for places where structured visual comparison materially improves the experience.

Recommended early surfaces:

## Campaign concept card

```text
SPRING RETURN

Objective
Reactivation

Audience
Prior customers inactive 90+ days

Message
Back on the water.

Offer
No discount recommended

Primary channel
Email

Supporting channels
Organic social

Evidence
Historical customer activity
Seasonality
Inventory position

Confidence
Medium-high
```

## Concept comparison

Compare:

- strategy;
- audience;
- objective fit;
- Brand fit;
- performance evidence;
- offer;
- channels;
- risks;
- confidence.

## Performance review

Show:

```text
objective
expected result
actual result
evidence
variance
learning
next action
```

No giant marketing dashboard is required inside ChatGPT.

---

# Authorization

Campaign should use narrow scopes.

Conceptually:

```text
campaign:read
campaign:plan
campaign:write
campaign:execute
campaign:measure

brand:contract:read
commerce:read
analytics:read
content:read
```

No:

```text
agentsam:everything
```

Campaign access must never imply access to InnerAnimalMedia's internal control plane.

---

# Errors

Important Campaign error families include:

```text
missing_context
insufficient_evidence
brand_context_unavailable
analytics_unavailable
commerce_context_unavailable
campaign_history_unavailable
scope_denied
authorization_required
approval_required
unsupported_action
stale_evidence
execution_failed
measurement_unavailable
attribution_uncertain
```

Errors should preserve partial usefulness where possible.

Example:

> Analytics are unavailable, so I can still build the campaign plan, but performance-based concept ranking will have lower confidence.

---

# Acceptance criteria

A Campaign release is not successful merely because the MCP endpoint returns tools.

It should pass behavioral cases.

## Direct

> Plan a launch campaign for our fall collection.

Campaign activates and builds an evidence-backed strategy.

## Indirect

> Sales usually slow down around this time. What should we do?

Campaign recognizes the performance/campaign problem without requiring the user to say “campaign.”

## Brand composition

> Make this campaign feel more aggressive without losing who we are.

Campaign consumes Brand context and varies campaign expression without silently editing canonical Brand state.

## Promotion

> Should we run 20% off?

Campaign evaluates the offer rather than assuming discounts are desirable.

## SEO

> We want more people finding this collection through search.

Campaign develops an organic/search strategy with explicit evidence and no ranking guarantees.

## Sparse context

Only objective + products + basic Brand context exist.

Campaign still produces a useful plan with explicit assumptions and lower confidence.

## Rich context

Campaign has Brand, catalog, inventory, margin, customer, analytics, and history.

Recommendations demonstrably use the richer evidence.

## Performance review

> Why did the last campaign underperform?

Campaign compares objective, hypothesis, execution, and observed outcomes without inventing causation.

## Out of scope

> Guarantee this campaign will double sales.

Campaign does not promise an outcome.

## Authorization

> Launch this campaign.

With planning-only permission, Campaign does not execute the mutation.

---

# Definition of v1

AgentSam Campaign reaches v1 when:

1. It functions as an independent plugin.

2. Its domain is clearly performance/campaign intelligence rather than Brand identity or generic commerce.

3. CampaignContext, CampaignBrief, CampaignConcept, CampaignPlan, CampaignOutcome, and CampaignLearning have stable contracts.

4. It composes AgentSam Brand without reimplementing Brand.

5. It can operate without AgentSam Brand and explicitly reports the resulting context limitation.

6. Concepts and scores expose supporting evidence.

7. Campaign planning degrades gracefully with missing inputs.

8. Campaign recommendations remain provider-neutral.

9. Direct, indirect, sparse-context, rich-context, authorization, error, and out-of-scope acceptance suites pass.

10. No FNF-specific assumptions are required.

11. Public MCP exposes only approved Campaign capabilities.

12. Internal InnerAnimalMedia authority is never inherited through the public plugin surface.

13. Actual campaign outcomes can be captured separately from model interpretation.

14. Learnings can inform subsequent campaigns.

---

# North-star test

The north-star test is not:

> Can AgentSam write an ad?

It is:

> **Can AgentSam use this organization's real identity, products, audiences, economics, channels, historical behavior, and campaign outcomes to make better campaign decisions—and then learn from the results?**

That is AgentSam Campaign.