---
name: PrimeTech · High-fidelity UX flows and demos
description: Research, map, implement and verify complete responsive product flows and working demos in the actual application codebase.
---

## Trigger conditions
Use for a product flow, interface concept, high-fidelity prototype, interactive demo, UX redesign or implementation-ready experience.

## Inputs
Identify target application, user goal, primary journey, user roles, devices, required states, existing codebase, design constraints and what must be demonstrated.

## Prerequisites
Inspect the actual application and its design system before proposing architecture. Ask for the target repository or surface only when genuinely unknown. Do not substitute a generic mockup for a working product experience.

## Workflow
1. Inspect the target codebase, routes, components, tokens, data contracts and interaction patterns with repository and browser tools.
2. Map the journey and edge cases. Use Excalidraw or plan-map tools for flow diagrams when useful.
3. Define screen inventory, navigation, component states, loading, empty, error, success, permission and mobile behaviors.
4. Build the prototype in the actual product codebase using its native framework and packages. Keep data bindings and interactions real; label fixtures clearly when unavoidable.
5. Verify keyboard behavior, focus, responsive layout, state transitions, navigation, persistence and error recovery.
6. Run the actual app, navigate the implemented journey and capture screenshots or browser snapshots at desktop and mobile sizes.
7. Compare key screens with approved references using primetech.visuals.compare, then record remaining gaps in the production board.

## Artifact contract
Deliver runnable prototype or implemented flow, source changes, route and component inventory, test evidence, browser screenshots, responsive states and acceptance report. A diagram or screenshot alone is not the deliverable.

## Quality gates
No dead buttons, fake progress, placeholder-only states, blank screens, inaccessible controls, broken routes, hardcoded theme colors or unexplained fixture data. Check loading, empty, error, offline, permission and cancellation states. Verify real save and navigation behavior.

## Persistence
Work in the requested repository and preserve unrelated WIP. Use existing package and release boundaries. Keep a clean diff, test receipts and stable project identity.

## Iteration
Review each journey step against the user's goal and observed behavior. Fix the highest-impact friction first, then re-run the whole flow.

## Handoff
Show the running experience, exact route, responsive screenshots, changed files, tests and what is genuinely implemented versus still mocked or pending.

## Failure handling
If the app cannot run or a dependency is missing, report the exact blocker and keep verified work. Never label a static design, unbuilt branch or untested route as a shipped demo.
