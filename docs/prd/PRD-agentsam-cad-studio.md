# AgentSam CAD Studio
## Product Requirements Document

**Status:** Experimental  
**Portfolio:** AgentSam  
**Primary package/app composition:** see Package composition below

## Product vision

An AgentSam-assisted spatial design and CAD workspace for creating, inspecting, iterating, and validating structured design artifacts across product, fabrication, robotics, and spatial workflows.

## Target users

- makers
- designers
- technical creators
- robotics/spatial builders

## Core jobs to be done

- create a structured design from intent
- inspect geometry and constraints
- iterate with an assistant
- validate outputs before fabrication or simulation
- preserve design provenance

## Product promise

> An AgentSam-assisted spatial design and CAD workspace for creating, inspecting, iterating, and validating structured design artifacts across product, fabrication, robotics, and spatial workflows.

## Why this should exist as a real offer

- lower barrier to structured design
- assistant-guided iteration
- portable artifact/evidence model
- path from intent to inspectable geometry

The offer is only valuable if users can complete these jobs end to end. Package publication, a demo screen, or an isolated API is not sufficient evidence of product value.

## What this product is not

- a toy image generator for CAD-looking pictures
- a replacement for engineering validation
- an autonomous fabrication controller

## Package composition

```text
apps/agentsam-cad-creator
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

- packaged app
- Local Studio app
- future plugin
- SDK capability

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

- stable design document contract
- create/edit/inspect loop
- constraints/errors
- export/import
- artifact provenance
- acceptance examples

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
