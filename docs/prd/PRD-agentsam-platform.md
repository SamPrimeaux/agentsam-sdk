# AgentSam Platform / SDK
## Product Requirements Document

**Status:** Alpha  
**Portfolio:** AgentSam  
**Primary package/app composition:** see Package composition below

## Product vision

A portable agentic application platform that lets developers and teams compose local, hosted, desktop, plugin, and embedded AgentSam capabilities without rebuilding the machinery each time.

## Target users

- developers building agentic applications
- teams standardizing agent workflows
- product builders who need portable local/hosted capability composition

## Core jobs to be done

- install a coherent SDK instead of assembling unrelated libraries
- compose models, tools, work, identity, storage, knowledge, and UI behind stable contracts
- ship AgentSam-powered products across web, desktop, CLI, plugins, and hosted runtimes

## Product promise

> A portable agentic application platform that lets developers and teams compose local, hosted, desktop, plugin, and embedded AgentSam capabilities without rebuilding the machinery each time.

## Why this should exist as a real offer

- reduces repeated infrastructure work
- keeps product contracts portable
- provides a common release train and integration surface

The offer is only valuable if users can complete these jobs end to end. Package publication, a demo screen, or an isolated API is not sufficient evidence of product value.

## What this product is not

- a single mandatory SaaS backend
- a provider-specific SDK
- an excuse to expose every internal package as a product

## Package composition

```text
@inneranimalmedia/agentsam-sdk
agentsam-contracts
agentsam-errors
agentsam-hooks
agentsam-workbench
agentsam-work-graph
agentsam-goap
agentsam-queue-control
agentsam-repository
agentsam-scoring
agentsam-vault
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

- npm SDK
- embedded packages
- reference apps
- hosted/desktop runtimes

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

- stable core contracts
- documented composition model
- provider-neutral examples
- versioned package release train
- clear local/hosted authority rules

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
