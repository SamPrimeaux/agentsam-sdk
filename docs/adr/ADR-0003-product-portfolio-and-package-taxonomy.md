# ADR: AgentSam Product Portfolio and Package Taxonomy

**Status:** Accepted  
**Decision type:** Product / architecture / packaging  
**Applies to:** `agentsam-sdk`, public packages, Local Studio, packaged apps, plugins, hosted runtimes, themes, adapters

## Context

`agentsam-sdk` contains many public npm packages and several apps. That does not mean every package should become a standalone product or commercial offer.

Without an explicit taxonomy, package names can accidentally become product names, infrastructure can be marketed as a feature, provider adapters can become false product boundaries, and closely related capabilities can fragment into weak offers.

## Decision

AgentSam uses four portfolio layers:

1. **Offers / products** - user-recognizable solutions with a clear problem, workflow, outcome, and commercial reason to exist.
2. **Domain engines / product packages** - reusable deterministic capabilities that power one or more offers.
3. **Shared primitives / infrastructure** - contracts, errors, vault, hooks, work graph, scoring, queueing, navigation, shell, and similar machinery.
4. **Adapters / themes / providers** - provider-specific integrations and reusable presentation packages that remain subordinate to the product experience.

A package is not automatically a product.

A product may compose multiple packages.

A package may support multiple products.

## Offer criteria

A standalone AgentSam offer should have:

- a recognizable user problem;
- a coherent end-to-end workflow;
- an outcome a user would intentionally seek;
- a defined data/authority boundary;
- graceful behavior when evidence is incomplete;
- a product surface appropriate to its host;
- acceptance cases that prove more than component existence;
- a plausible acquisition, packaging, or monetization path.

If those conditions are not met, the capability remains a package or supporting subsystem.

## Product portfolio

The current aspirational portfolio is:

```text
AgentSam Platform / SDK
  |
  +-- AgentSam Local Studio
  +-- AgentSam Work
  +-- AgentSam Brand
  +-- AgentSam Campaign
  +-- AgentSam Content Studio
  +-- AgentSam Database Studio
  +-- AgentSam Browser
  +-- AgentSam Analytics
  +-- AgentSam Knowledge
  +-- AgentSam Merch
  +-- AgentSam CAD Studio
  +-- AgentSam Commerce Studio
  +-- AgentSam Site Studio
  +-- AgentSam Developer Studio
  +-- AgentSam Hosted Runtime
```

These offers are allowed to share primitives while keeping their product identity distinct.

## Package taxonomy

Examples of **domain/product packages**:

- `@inneranimalmedia/agentsam-brand`
- `@inneranimalmedia/agentsam-campaign`
- `@inneranimalmedia/agentsam-content`
- `@inneranimalmedia/agentsam-content-studio`
- `@inneranimalmedia/agentsam-database-editor`
- `@inneranimalmedia/agentsam-analytics`
- `@inneranimalmedia/agentsam-knowledge`
- `@inneranimalmedia/agentsam-merch`
- `@inneranimalmedia/agentsam-work`
- `@inneranimalmedia/agentsam-abs`
- `@inneranimalmedia/agentsam-browser-surface`
- `@inneranimalmedia/agentsam-ide`

Examples of **shared primitives**:

- `@inneranimalmedia/agentsam-contracts`
- `@inneranimalmedia/agentsam-errors`
- `@inneranimalmedia/agentsam-hooks`
- `@inneranimalmedia/agentsam-goap`
- `@inneranimalmedia/agentsam-queue-control`
- `@inneranimalmedia/agentsam-repository`
- `@inneranimalmedia/agentsam-scoring`
- `@inneranimalmedia/agentsam-vault`
- `@inneranimalmedia/agentsam-workbench`
- `@inneranimalmedia/agentsam-work-graph`
- `@inneranimalmedia/agentsam-settings`
- `@inneranimalmedia/agentsam-shell-kit`
- `@inneranimalmedia/agentsam-nav`
- `@inneranimalmedia/agentsam-assets-core`

Examples of **adapters/providers**:

- `@inneranimalmedia/agentsam-cloudflare-images`
- `@inneranimalmedia/agentsam-provider-completeful`
- `@inneranimalmedia/agentsam-connector-cloudflare`
- future commerce, analytics, identity, storage, model, and deployment adapters.

Examples of **themes/prebuilds**:

- `theme-cypress`
- `theme-ember`
- `theme-forge`
- `theme-grove`
- `theme-harbor`
- `theme-heuristic`
- `theme-iasf`
- `theme-resolve`
- `theme-scenes`
- `theme-summit`
- `theme-violet`

These are sellable assets or ingredients, but they are not separate AgentSam domain authorities.

## Consequences

- Product naming is based on user value, not package internals.
- Provider names remain implementation details unless the user explicitly chooses that provider.
- Shared primitives should become stronger, not get duplicated inside each offer.
- New packages require an explicit placement in the taxonomy.
- PRDs are created for offers; ADRs govern cross-offer authority and composition.

## Rejected alternatives

### Every npm package is a product

Rejected because it creates weak, confusing offers and exposes implementation structure as product strategy.

### One giant AgentSam application owns everything

Rejected because it collapses clear domain authorities and makes portability, plugins, distribution, and independent evolution harder.

### Provider-specific products by default

Rejected because AgentSam should remain provider-neutral and user-recognizable at the product layer.
