# AgentSam Database Studio
## Product Requirements Document

**Status:** Alpha  
**Portfolio:** AgentSam  
**Primary package/app composition:** see Package composition below

## Product vision

A safe, portable database workspace for inspecting, querying, understanding, and editing supported databases with AgentSam assistance and explicit write boundaries.

## Target users

- developers
- technical operators
- small teams managing app data

## Core jobs to be done

- inspect schema and records
- run safe queries
- understand relationships
- edit data with review
- work across local SQLite and hosted database providers

## Product promise

> A safe, portable database workspace for inspecting, querying, understanding, and editing supported databases with AgentSam assistance and explicit write boundaries.

## Why this should exist as a real offer

- faster data understanding
- portable database UX
- safer assisted edits
- less provider-specific tooling

The offer is only valuable if users can complete these jobs end to end. Package publication, a demo screen, or an isolated API is not sufficient evidence of product value.

## What this product is not

- an unrestricted production SQL shell
- a provider-branded clone
- a replacement for database authority/security

## Package composition

```text
agentsam-database-editor
agentsam-workbench
agentsam-errors
agentsam-scoring
```

Packages are implementation ingredients. The product boundary is the user outcome described in this PRD.

## Product principles

1. Prefer user-recognizable operations over infrastructure-shaped APIs.
2. Preserve provider neutrality unless a provider-specific choice is the user's explicit goal.
3. Distinguish observed facts, inferred judgments, proposed actions, and executed changes.
4. Missing evidence reduces confidence instead of creating fabricated facts.
5. Writes to external systems require clear authorization and bounded scope.
6. The core workflow should remain usable without unnecessary custom UI.
7. Local and hosted forms should share domain contracts where practical.
8. Errors should preserve partial usefulness and explain recovery paths.

## Initial user workflow

```text
intent
  |
  v
context / evidence
  |
  v
plan or draft
  |
  v
inspect / evaluate
  |
  v
user decision or approval
  |
  v
optional action
  |
  v
receipt / artifact / learning
```

The exact steps vary by product, but the workflow should remain explicit and inspectable.

## Data and authority

This product must document:

- which records it owns;
- which external systems remain authoritative;
- provenance of consumed evidence;
- freshness/staleness behavior;
- authorization for writes;
- how local and hosted state reconcile, where applicable.

No product should silently claim authority over data owned by another domain.

## Distribution

- Local Studio packaged app
- SDK package
- standalone/admin embed

Distribution may evolve, but every form should preserve the same core product promise.

## Packaging / monetization hypotheses

Potential real-world packaging may include:

- free core package or local capability;
- paid hosted convenience or managed runtime;
- paid team/collaboration features;
- premium packaged application;
- domain plugin/app distribution;
- support, implementation, or commercial deployment services;
- usage-based infrastructure only where the underlying cost scales with usage.

The final commercial model should follow observed adoption and cost structure rather than force every package into a subscription.

## Definition of v1

- SQLite/D1/Postgres/Supabase adapters
- schema browser
- query/results
- edit approval
- receipts/errors
- portable host contract

## Acceptance suite

A v1 candidate should pass:

### Direct
A user explicitly asks for the product's primary job and reaches a useful outcome.

### Indirect
A user describes the underlying problem without using the product name; the workflow still activates appropriately.

### Sparse context
The product remains useful with minimal evidence and clearly states limitations.

### Rich context
Additional authorized evidence materially improves the result.

### Failure
A provider, source, or action fails and the product returns structured, recoverable behavior where possible.

### Authorization
A requested write exceeds current authority and is not silently executed.

### Out of scope
The product refuses or delegates work that belongs to another AgentSam domain instead of absorbing it.

## Success signals

Product quality should be measured by outcomes such as:

- successful completion of the core workflow;
- lower time/effort to reach the intended outcome;
- repeat use for the same job;
- successful recovery from missing data or provider failure;
- low rate of unauthorized or incorrect actions;
- evidence that users prefer the integrated offer over manually combining generic tools.

## Graduation rule

This product should not be called v1 until it satisfies `ADR-0005-offer-graduation-standard.md`.
