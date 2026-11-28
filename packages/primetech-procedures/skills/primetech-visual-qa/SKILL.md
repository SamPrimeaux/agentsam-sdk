---
name: PrimeTech · Visual quality assurance
description: Compare approved references and rendered outputs with measurable image evidence and a separate semantic design review.
---

## Trigger conditions
Use for visual QA, reference comparison, screenshot review, render verification or evidence that a design revision actually landed.

## Inputs
Identify approved reference, candidate render, exact viewport, device scale, state, theme, browser and acceptance criteria.

## Prerequisites
Capture actual current application output. Ensure reference and candidate represent the same dimensions and state before pixel comparison. A screenshot from an old build is not proof of the current build.

## Workflow
1. Capture reference and candidate at matching viewport and state.
2. Inspect layout, typography, hierarchy, contrast, alignment, clipping, content fidelity and interaction affordances.
3. Run primetech.visuals.compare when dimensions match to generate diff, overlay, MAE, RMSE, changed-pixel ratio and report.
4. Review semantic differences separately; pixel similarity cannot determine whether a workflow is correct or accessible.
5. Record defects with screenshot evidence, location, severity, reproduction steps and expected result.
6. Re-run the full affected flow after fixes and preserve before/after evidence.

## Artifact contract
Deliver reference and candidate paths, viewport details, diff and overlay images, machine-readable metrics, semantic findings, severity and pass/review result.

## Quality gates
Do not treat pixel metrics as a substitute for UX judgment. Flag mismatched dimensions, stale references, fixture data, hidden controls, inaccessible contrast and interaction failures. State exactly which thresholds passed or failed.

## Persistence
Keep evidence with the project or approved QA artifact store. Preserve original screenshots and hashes. Never overwrite the approved reference.

## Iteration
Re-test the same viewport and state after each change. Track resolved, regressed and open findings.

## Handoff
Summarize measurable result, semantic review, affected screens and remaining defects. Link actual evidence artifacts.

## Failure handling
If screenshots cannot be captured or dimensions do not match, report the comparison as blocked. Do not invent metrics or claim a pass without the generated report.
