# Visual design, presentation fidelity and source-to-implementation traceability

**Status:** Portable, proposed delivery procedure; apply through the consuming project's existing approved design/brand authority. It does not create a new company identity, an automatic mockup approval, or a new UI renderer.

## Fidelity and format are independent

A *fidelity level* describes how specifically a screen's content, styling, components and behavior are established. A *presentation format* describes how reviewers see that screen. A high-fidelity image in a smartphone frame is still high fidelity, but the frame alone does not establish implementation dimensions or editable controls.

Choose a format for the decision being made:

| Format | Purpose | Required accompanying evidence |
|---|---|---|
| Structural wireframe | Navigation, content order, component/inspector hierarchy | Flow/section IDs and hierarchy |
| Flat high-fidelity screen | Primary reproducible design-to-development target | Exact viewport size, text, components, spacing, states |
| Device-framed board | Stakeholder presentation and comparison of device states | Link to canonical flat screens; not a second design |
| Annotated implementation spec | Development contract over the approved screens | Components, dimensions, touch/keyboard behavior, data, responsive rules |
| Interaction prototype | Observe flows and motion, simulate or execute interactions | Clear label: simulation vs connected real operation |
| Production browser capture | Verify the actual implementation | URL/build SHA, real viewport dimensions and runtime context |
| Visual/functional QA | Compare design intent with build | Diffs, screenshots, accepted deviations, test receipts |

A large printable presentation board is a **derived view**, not an authority that replaces the source design.

## Mandatory interpretation mode

Before creating or modifying a significant UI, record one of:

1. **Reference-driven recreation.** The user specified an existing screenshot/design to reproduce with high fidelity. Document exact observable elements and required behaviors. Do not reinterpret composition simply to save implementation time.
2. **Inspired exploration.** The reference provides a principle, motif or interaction lesson; propose an original execution without copying distinctive protected artwork or claiming the reference as owned.
3. **Concept alternatives.** The user requests independent directions or multiple variations. Keep each labeled PROPOSED. Do not silently select one as canonical.
4. **Approved-design implementation.** The user approved a versioned, editable target. Build and test against it; unauthorized substantial deviations require a decision record.
5. **Existing-product refinement.** Preserve installed user workflows, data model, known working interactions, mobile navigation and platform shell unless explicitly authorized to change them.

The mode is part of the work item, not inferred each time a different agent opens the files.

## Canonical design record

Keep one stable project-specific ID across related media. For example (illustrative only): TS-MOBILE-001. Record:

- source design file, original screenshot hash and provenance;
- explicit mode, owner, approval status, revision and timestamp;
- editable design tokens, components and actual viewport dimensions;
- independent states (e.g. Preview, Sections, Edit) and state transition conditions;
- interaction contracts, keyboard/touch accessibility, responsive priority and reduced-motion behavior;
- project constraints and existing UI functionality that MUST remain;
- three requirement classes: **must match**, **behaviorally equivalent**, **open to interpretation**;
- implementation owner and source component IDs;
- associated test, build capture, design review, discrepancy decision and final acceptance.

Prefer filenames that retain the same ID and stage, for example:

`TS-MOBILE-001__03-WIREFLOW__edit-sheet__v01.png`
`TS-MOBILE-001__04-HIFI__preview-first__v01.png`
`TS-MOBILE-001__04-STATE-BOARD__preview-edit-expanded__v01.png`
`TS-MOBILE-001__05-SPEC__mobile-controls__v01.md`
`TS-MOBILE-001__BUILD-CAPTURE__viewport-390__sha-xxxx.png`
`TS-MOBILE-001__VISUAL-QA__revision-01.md`

The design ID expresses identity; the revision and artifact type express purpose. Do not overwrite original screenshots, accepted designs or creative intent when preparing derivatives.

## One source, many projections

A single **canonical editable design** must produce flat screen views, device-framed presentations, annotations and prototypes. Where the design tool supports it, use reusable frames/components, variants, constraints, design tokens and states rather than maintaining four independent redraws.

If a screenshot is the only source, it remains preserved as immutable evidence. An inferred editable design starts in PROPOSED mode until reviewed. An image-generation output alone cannot satisfy an editable implementation contract or actual responsive behavior.

Implementation capture must come from the actual frontend, not a rendered mockup of the frontend.

## Review loop

1. Capture immutable reference and choose interpretation mode.
2. Define screen/scene ID, intent, target platforms, must-match/allowed deviations.
3. Build/edit one canonical flat high-fidelity design, link all state variants.
4. Derive presentation boards and annotate implementation specs.
5. Approve the specific revision before implementation is claimed to match.
6. Build actual components using the existing project's CMS/SAM/frontend runtime.
7. Capture browser evidence at the specified viewports and exercise interactions.
8. Compare against the approved design and record discrepancy/accepted deviations.
9. Reopen saved state, regression-check adjacent user journeys and certify source fidelity.

Use proportionate responsive layouts; avoid arbitrary hardcoded width breakpoints that produce intermediate gaps. The target viewport table is test evidence, not a license to implement only those exact widths.

## Illustrative mobile Theme Studio behavioral example

For a preview-first mobile editor, a reference-driven specification may require: preview remains visible while editing; a contextual sheet supports collapsed/editing/expanded states; selected elements receive contextual controls; miniAgentSam appears near relevant selection; existing mobile dock, Theme Settings, CMS draft state and Side Assistant remain available. These are **illustrative constraints**, not automatic requirements for unrelated products. If an approved design establishes them, replacing them with isolated full-screen tabs without approval is a fidelity regression, even if each tab is functional.

## Acceptance rule

An agent cannot mark fidelity VERIFIED from a device presentation board or static screenshot. The implementation must exhibit the specified states and behavior in the actual host environment, with reviewable captures, source hashes, tests and accepted deviations. Artistic resonance remains a human creative review, not an arbitrary automatic score.
