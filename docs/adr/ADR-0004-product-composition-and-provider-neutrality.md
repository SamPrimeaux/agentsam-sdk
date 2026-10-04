# ADR: AgentSam Product Composition and Provider Neutrality

**Status:** Accepted  
**Decision type:** Architecture / product boundary  
**Applies to:** all AgentSam offers, packages, adapters, plugins, hosted and desktop surfaces

## Decision

AgentSam products compose through stable domain contracts and shared primitives. Provider-specific systems remain adapters underneath user-recognizable product operations.

The canonical direction is:

```text
user goal
   |
   v
AgentSam product
   |
   v
domain contract / capability
   |
   +-- provider adapter A
   +-- provider adapter B
   +-- local implementation
   +-- hosted implementation
```

A product must not become synonymous with one provider when the underlying user problem is provider-independent.

## Rules

1. Product names describe user value, not infrastructure.
2. Packages expose portable contracts before host-specific glue.
3. Provider credentials remain scoped to the adapter that needs them.
4. Raw provider capabilities are not automatically exposed as public AgentSam tools.
5. Hosted and local implementations should share domain semantics where practical.
6. Apps may compose packages but must not silently fork their contracts.
7. External writes require explicit authorization, bounded scopes, and receipts where practical.
8. A provider outage should degrade the affected capability, not redefine the product.

## Examples

Campaign may consume commerce data, but does not become Shopify, Completeful, or another commerce provider.

Content may deliver through Cloudflare Images or another image service, but Content remains the user-facing domain.

Database Studio may connect to SQLite, D1, Postgres, or Supabase while preserving a provider-neutral database workflow.

Browser may use multiple model providers while preserving one Browse/Build product surface.

## Consequences

- New provider integrations should be implemented as adapters/connectors.
- PRDs must describe the user workflow independently of one provider.
- Public plugin surfaces should expose product verbs rather than raw provider APIs.
- Tests should include provider substitution or missing-provider behavior where relevant.
