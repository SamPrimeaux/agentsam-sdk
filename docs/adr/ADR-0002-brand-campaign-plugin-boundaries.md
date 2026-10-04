# ADR: AgentSam Brand and AgentSam Campaign Plugin Boundaries

**Status:** Accepted  
**Decision type:** Product / architecture boundary  
**Applies to:** `agentsam-sdk`, `agentsam-plugin-mcp`, AgentSam plugin packaging, Local Studio, ChatGPT distribution

## Context

AgentSam is evolving from a single collection of packages and tools into a host platform for installable domain plugins.

Two of the first major plugins are:

- **AgentSam Brand**
- **AgentSam Campaign**

Both operate on related business context, and both may use assets, content, products, analytics, commerce data, and external connections.

That overlap creates a risk of collapsing them into one large “marketing” product.

We explicitly reject that architecture.

Brand and Campaign solve different user problems and must remain independent, composable plugins.

---

# Decision

## AgentSam Brand is the identity and creative-governance plugin

AgentSam Brand owns the question:

> **Who are we, and how should that identity be expressed?**

Its responsibility is to define, refine, extend, govern, and preserve a distinctive brand system.

Its domain includes:

- brand identity;
- positioning;
- principles;
- audience definition where part of brand strategy;
- differentiators;
- voice;
- terminology;
- visual language;
- logos and marks;
- typography;
- color systems;
- imagery;
- composition;
- brand asset roles;
- canonical assets;
- brand consistency;
- brand provenance;
- creative standards;
- approved variation;
- brand extensions;
- evaluation of whether new work belongs within the brand system.

AgentSam Brand may help create new expressions of a brand.

A campaign-specific visual direction, seasonal motif, editorial treatment, sub-brand treatment, collection identity, or other creative extension may originate through Brand when it needs to become an intentional part of the brand system.

Brand does not exist merely to constrain Campaign.

It is a complete product in its own right.

---

## AgentSam Campaign is the performance and campaign-intelligence plugin

AgentSam Campaign owns the question:

> **What should we do now to achieve a measurable objective?**

Its responsibility is to plan, evaluate, coordinate, measure, and improve performance-driven campaigns.

Its domain includes:

- campaign objectives;
- audience selection and segmentation;
- acquisition;
- retention;
- reactivation;
- launches;
- promotions;
- offers;
- SEO and search opportunity;
- organic promotion;
- paid promotion strategy;
- messaging;
- channel selection;
- merchandising strategy;
- campaign assortment recommendations;
- content requirements;
- creative requirements;
- campaign variants;
- experiments;
- conversion;
- traffic;
- campaign economics;
- inventory-aware campaign decisions;
- historical performance;
- attribution;
- measurement;
- post-campaign review;
- learning;
- optimization.

Campaign should answer questions such as:

> Which campaign should we run?

> Who should we target?

> What message is most likely to work?

> Should we offer a discount?

> Which channels make sense?

> What should we test?

> What did the campaign actually produce?

> What should we change next time?

AgentSam Campaign is not simply a copywriting or content-generation plugin.

Its defining characteristic is **performance-oriented decision making grounded in available evidence**.

---

# Relationship between the plugins

The canonical relationship is:

```text
AgentSam Brand
      │
      │ BrandContract / approved identity system
      ▼
AgentSam Campaign
      │
      │ campaign objective + evidence
      ▼
performance strategy
```

Brand answers:

```text
Who are we?
What makes us distinct?
How should we look?
How should we sound?
What is canonical?
What variation is legitimate?
```

Campaign answers:

```text
What are we trying to achieve?
Who should we reach?
What should we say right now?
Where should we say it?
What should we promote?
What should we test?
What is likely to perform?
What happened?
What did we learn?
```

Campaign may consume BrandContract as evidence and constraint.

Campaign must not silently redefine the canonical BrandContract.

If campaign work reveals a potentially valuable new brand expression, Campaign may propose a Brand extension or request Brand involvement.

Example:

```text
Campaign:
"We need a more energetic visual treatment for this seasonal launch."

        ↓

Brand:
"That treatment can be formalized as an approved seasonal extension."

        ↓

Campaign:
uses that approved extension
```

---

# Brand fit is not campaign performance

Campaign evaluation may include `brand_fit`, but Brand fit is only one dimension.

A campaign can be:

- perfectly on-brand but commercially weak;
- highly performant but damaging to brand identity;
- strong for acquisition but poor for retention;
- effective on one channel but ineffective on another.

Campaign therefore evaluates multiple dimensions.

Possible evaluation families include:

```text
objective_fit
brand_fit
audience_fit
message_fit
channel_fit
search_opportunity
offer_strength
conversion_evidence
historical_performance
inventory_fit
margin_fit
seasonality
creative_feasibility
execution_cost
evidence_quality
```

No single dimension is synonymous with campaign quality.

---

# Campaign may vary Brand without redefining Brand

Brand should establish the acceptable creative territory.

Campaign should be able to explore within that territory.

For example, one BrandContract may support:

```text
Acquisition campaign
- explicit product value
- strong CTA
- search-oriented copy
- utility-focused creative

Retention campaign
- insider language
- lower-pressure CTA
- collection storytelling
- customer familiarity

Seasonal campaign
- higher energy
- temporary visual motif
- urgency
- seasonal vocabulary
```

These may look significantly different while remaining legitimate expressions of the same brand.

Variation is not inconsistency when it is intentional and governed.

---

# Product creation is not owned by Campaign

Campaign may recommend:

- a bundle;
- a launch-exclusive assortment;
- a seasonal colorway;
- a promotional package;
- a collection;
- a product focus;
- a price test;
- an offer;
- a cross-sell;
- an upsell.

But Campaign does not become the canonical product creation or manufacturing engine.

Product creation, manufacturing readiness, variants, fulfillment, catalog mutation, and commerce operations belong to appropriate sibling capabilities such as:

```text
AgentSam Commerce
AgentSam Merch
AgentSam Content
provider-specific commerce adapters
```

Campaign expresses the commercial need.

The appropriate domain capability performs the operation.

Example:

```text
Campaign
"Create a three-product starter bundle
for first-time customers."

        ↓

Commerce / Merch
validates products
pricing
variants
inventory
production
provider capability

        ↓

Campaign
uses resulting product/offer
inside the campaign
```

---

# Content production is not owned by Campaign

Campaign may determine:

```text
We need:
- landing-page hero
- three product-detail images
- two short-form videos
- email hero
- paid-social variants
- SEO landing copy
```

Campaign owns the requirement.

Content Studio, Brand, asset tooling, media generation, or other appropriate capabilities produce or prepare the actual artifacts.

Campaign therefore coordinates output requirements without becoming a giant CMS or media editor.

---

# SEO belongs in Campaign as a performance discipline

SEO is not merely metadata.

Campaign may reason about:

- search intent;
- demand;
- organic acquisition;
- keyword/topic opportunity;
- landing-page strategy;
- product/category discoverability;
- content opportunity;
- query-to-offer fit;
- organic versus paid channel interaction;
- measurable search performance.

Content Studio may own the actual content and metadata operations.

Campaign owns the strategic question:

> **What search opportunity should we pursue, and how should it support this campaign objective?**

Campaign must never guarantee ranking outcomes.

---

# Shared evidence

Campaign may use:

```text
BrandContract
product catalog
inventory
COGS
retail price
orders
traffic
conversion
customer segments
content
media
campaign history
channel history
SEO/search data
seasonality
operational constraints
```

Not every installation will have every source.

Campaign must degrade gracefully.

More evidence increases confidence.

Missing evidence must reduce confidence rather than trigger fabricated assumptions.

---

# Plugin independence

Both Brand and Campaign are independently installable products.

```text
plugins/
  agentsam-brand/
    plugin.json
    skills/
    mcp.json
    assets/

  agentsam-campaign/
    plugin.json
    skills/
    mcp.json
    assets/
```

A user may install Brand without Campaign.

A user may install Campaign without Brand.

When Campaign has no Brand plugin or BrandContract available, it may still operate using supplied campaign context, but must clearly report the absence of canonical brand intelligence.

When both are installed, they should compose.

---

# Domain package independence

Plugin packaging must not swallow the underlying deterministic packages.

Example:

```text
@inneranimalmedia/agentsam-brand
        ↓
AgentSam Brand plugin

@inneranimalmedia/agentsam-campaign
        ↓
AgentSam Campaign plugin
```

The package is the reusable domain capability.

The plugin is the installable user-facing workflow and capability surface.

---

# Public MCP boundary

Both plugins may use `agentsam-plugin-mcp`.

They share infrastructure, not domain identity.

Conceptually:

```text
ChatGPT / Local Studio / MCP host
                │
                ▼
       agentsam-plugin-mcp
                │
        ┌───────┴────────┐
        ▼                ▼
   Brand module      Campaign module
        │                │
        ▼                ▼
 agentsam-brand    agentsam-campaign
```

Public MCP must remain allowlisted and least-privilege.

There must be no implicit bridge to the internal `inneranimalmedia-mcp-server`.

Shared code is acceptable.

Shared authority is not.

---

# Data authority

Brand is authoritative for canonical brand state.

Campaign is authoritative for campaign state.

Examples:

```text
BrandContract
brand decisions
canonical assets
approved extensions
        → Brand authority
```

```text
campaign briefs
campaign concepts
campaign plans
experiments
campaign outcomes
performance learnings
        → Campaign authority
```

Commerce systems remain authoritative for live products, inventory, orders, etc.

Analytics systems remain authoritative for observed performance facts.

Plugins may project or consume those facts without pretending to own them.

---

# Campaign learning loop

Campaign should form a durable closed loop:

```text
objective
   ↓
context
   ↓
hypothesis
   ↓
campaign concept
   ↓
campaign plan
   ↓
execution
   ↓
measurement
   ↓
evaluation
   ↓
learning
   ↓
future campaign
```

This loop is a defining product characteristic.

Campaign history should become progressively more useful as actual outcomes accumulate.

---

# Architectural invariants

1. AgentSam Brand and AgentSam Campaign are separate plugins.

2. Brand owns identity, creative system, brand standards, and brand extensions.

3. Campaign owns campaign strategy, performance, experimentation, measurement, and optimization.

4. Campaign may consume BrandContract but cannot silently rewrite it.

5. Campaign may recommend products, bundles, assortments, or creative needs but does not absorb Commerce, Merch, Content, or Brand engines.

6. Provider-specific APIs remain adapters beneath user-recognizable domain operations.

7. Campaign scores must expose evidence and should never become unexplained AI-generated numbers.

8. Missing evidence reduces confidence rather than creating invented facts.

9. Public MCP and internal InnerAnimalMedia MCP remain separate trust boundaries.

10. Plugin composition should replace monolithic plugin expansion.

---

# Decision summary

The product family should be understood as:

```text
AgentSam Brand
Distinctive identity.

AgentSam Campaign
Measured performance.

AgentSam Content
Content and media operations.

AgentSam Commerce / Merch
Products and commerce operations.

AgentSam
The host/runtime that allows them to cooperate.
```

This separation allows each plugin to become excellent at one coherent user problem while still combining into a much more capable system.