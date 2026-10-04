# AgentSam Local Studio
## Product Requirements Document

**Status:** Alpha  
**Portfolio:** AgentSam  
**Primary package/app composition:** see Package composition below

## Product vision

A local-first desktop and hosted workbench where users can connect their own providers, projects, terminals, knowledge, and packaged AgentSam apps and actually get work done.

## Target users

- developers
- technical creators
- operators who want local-first AI assistance
- users who want a downloadable AgentSam workspace

## Core jobs to be done

- open a project and understand it
- chat and act with project-aware AgentSam
- use local terminals and connected providers
- run reusable AgentSam product surfaces in one shell

## Product promise

> A local-first desktop and hosted workbench where users can connect their own providers, projects, terminals, knowledge, and packaged AgentSam apps and actually get work done.

## Why this should exist as a real offer

- local-first control
- portable product surfaces
- one place for connected project work
- desktop-native access to machine capabilities

The offer is only valuable if users can complete these jobs end to end. Package publication, a demo screen, or an isolated API is not sufficient evidence of product value.

## What this product is not

- a thin chat wrapper
- an InnerAnimalMedia-only admin portal
- a desktop shell that requires company IAM

## Package composition

```text
apps/agentsam-local-studio
agentsam-workbench
agentsam-ide
agentsam-key-manager
agentsam-settings
agentsam-browser-surface
agentsam-desktop-shell
agentsam-shell-kit
agentsam-nav
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

- downloadable desktop app
- hosted web app
- SDK reference host

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

- reliable public login/provider setup
- same core surface hosted and desktop
- persistent project/work context
- terminal + file + workbench integration
- safe key storage
- installable packaged capabilities

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
