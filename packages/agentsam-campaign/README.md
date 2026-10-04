# @inneranimalmedia/agentsam-campaign

Portable, provider-neutral campaign intelligence for AgentSam.

AgentSam Campaign turns real brand, product, inventory, audience, margin, and
performance context into grounded campaign briefs, concept evaluations,
rankings, and review-gated campaign plans.

## Purpose

The package is designed to help answer practical campaign questions such as:

- What should we promote or launch?
- Which products belong together in a campaign?
- Which concept is best supported by our current inventory and margins?
- Does the creative direction fit the BrandContract?
- Which audience or customer segment is the campaign actually for?
- What offer or hook is commercially reasonable?
- What should the campaign measure?
- Which concepts deserve further investment?
- What evidence are we missing before launch?
- How should promotional, SEO, content, social, email, and merchandising work fit together?

## Benefits

- **Brand-grounded:** Campaigns can consume the current AgentSam BrandContract.
- **Commerce-aware:** Product, inventory, margin, and offer context can influence evaluation.
- **Evidence-backed:** Missing evidence is surfaced instead of silently invented.
- **SEO/content ready:** Briefs and plans can carry search/content strategy alongside campaign direction.
- **Promotional planning:** Supports drops, launches, offers, seasonal pushes, collections, and merchandising motions.
- **Comparable concepts:** Deterministic scoring makes alternatives easier to compare and review.
- **Provider-neutral:** No Shopify, Completeful, Cloudflare, OpenAI, or other provider is baked into the product identity.
- **Portable:** The same domain package can be used by ChatGPT plugins, AgentSam Local Studio, CLI/TUI workflows, SDK consumers, and other hosts.
- **Review-gated:** Creation and evaluation are separated from publication or launch.
- **Outcome-aware:** Historical campaign and performance data can be incorporated when available.

## Core capabilities

    normalizeCampaignContext
    buildCampaignBrief
    evaluateCampaignConcept
    rankCampaignConcepts
    buildCampaignPlan

ChatGPT or another model may propose creative campaign concepts. This package
grounds those concepts in actual BrandContract, product, inventory, audience,
margin, SEO/content, and performance evidence; then evaluates, ranks, and plans
them.

It does not guarantee commercial outcomes and does not autonomously publish or
launch campaigns.

## Intended surfaces

- AgentSam Campaign Studio
- ChatGPT / MCP plugin workflows
- AgentSam Local Studio
- AgentSam CLI / TUI
- SDK consumers
- Commerce and merchandising applications
- Marketing and promotional planning tools

## Typical campaign types

- Product launches
- Limited drops
- Merch collections
- Seasonal campaigns
- Promotional offers
- Brand campaigns
- Email campaigns
- Social campaigns
- SEO/content campaigns
- Audience re-engagement
- Inventory-driven promotions
- Margin-aware promotions
- Cross-sell and bundle concepts
- New-product validation
- Go-to-market planning

## Design principle

The creative model should be free to propose ideas, but factual commercial
claims should come from evidence. Product availability, margins, inventory,
audience history, BrandContract rules, and prior performance should be grounded
through AgentSam data and connections rather than hallucinated.
