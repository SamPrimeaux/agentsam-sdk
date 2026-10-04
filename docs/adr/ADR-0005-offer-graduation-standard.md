# ADR: AgentSam Offer Graduation Standard

**Status:** Accepted  
**Decision type:** Product quality / release governance  
**Applies to:** any AgentSam package or app proposed as a real-world product, plugin, paid feature, or standalone offer

## Context

AgentSam has many strong components. A component becomes commercially meaningful only when it solves an end-to-end user problem reliably.

## Decision

An AgentSam capability graduates into a real offer only after it satisfies the following gates.

## Gate 1 - Clear user problem

The offer has a defined user, painful job, expected outcome, and explicit non-goals.

## Gate 2 - Complete workflow

The user can reach the promised outcome without stitching together undocumented package internals.

## Gate 3 - Authority and evidence

The offer knows which data it owns, which data it consumes, which facts are observed, and which outputs are inferred or proposed.

## Gate 4 - Portability

The core domain capability is reusable across appropriate hosts and is not unnecessarily tied to one customer's app, provider, or deployment.

## Gate 5 - Trust

Authentication, authorization, approvals, secret handling, error behavior, and write boundaries are explicit.

## Gate 6 - Quality

The offer has direct, indirect, sparse-context, rich-context, negative, failure, and out-of-scope acceptance cases.

## Gate 7 - Product experience

The offer has coherent naming, onboarding, defaults, empty states, progress, failure recovery, accessibility, and responsive behavior appropriate to its host.

## Gate 8 - Operations

The offer has versioning, health, telemetry, logs, receipts where needed, upgrade behavior, and support/debugging paths.

## Gate 9 - Distribution

The offer has a defined delivery form such as npm package, desktop app, hosted app, plugin, template, runtime, or service.

## Gate 10 - Commercial value

There is a plausible reason a user or organization would adopt or pay for the outcome rather than merely admire the technology.

## Status vocabulary

- **Primitive** - internal/reusable machinery.
- **Experimental** - useful capability under active product discovery.
- **Alpha** - end-to-end workflow exists, still changing materially.
- **Beta** - stable enough for external users with known limitations.
- **v1** - coherent supported offer meeting its acceptance criteria.
- **Deprecated** - being removed or replaced.

## Consequence

Package publication alone does not equal product graduation.
