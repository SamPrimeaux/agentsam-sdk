# AgentSam UI Quality Contract — v1

**Enforced code and browser evidence, not a system-prompt claim.** The contract
is `protocol/ui/agentsam.ui-quality.v1.schema.json`; the first production
adapter is the portable `@inneranimalmedia/agentsam-settings` UI used in
hosted Studio and packaged desktop. Generated CMS blocks/themes, other native
components, and customer-hosted applications must use the same contract to
ship a `ready` receipt; a Settings-only passing receipt is **not evidence**
that those other surfaces have passed.

## Required evidence

| Check | Minimum release requirement |
| --- | --- |
| Semantic/accessibility | Semantic headings, input labels, dialog roles, accessible names on icon buttons, images with meaningful or explicitly empty alt |
| Keyboard | Focus entry/return, Tab containment, Escape dismissal, visible keyboard focus |
| Contrast | WCAG AA 4.5:1 for normal text, 3:1 for large text, 3:1 for applicable UI controls and their focus indicators |
| Responsive | Render at 320, 390, 640, 820, 1100, 1440, 1920 CSS px, no unintended body horizontal overflow or unreachable controls |
| Mobile | One primary workspace, minimum 44px tall touch actions, safe-area and dynamic viewport padding, keyboard-safe sheets |
| Styling | Shared design tokens and portable utility classes, reject **new static inline styles**; runtime-dependent CSS values require an auditable exception |
| Behavior | No dead controls, mislabeled saved state, fake "connected" status, or unexpected navigation away from draft work |
| Portability | Browser + desktop use identical package components and account-scoped services; platform-specific host adapters only for auth/OS capabilities |

**Breakpoints** are content-adaptive; viewport widths are test targets, not
physical-device labels. 320–767px use one main workspace; tablets progressively
reveal tools and rails; desktop layouts have constrained readable content
widths and may expose multiple panes. Mobile usability is interaction-based,
not only responsive CSS.

For each changed UI target, emit a machine-readable receipt. Only computed
results may set `ready: true`; neither a stored status nor a text prompt can.
Missing, failed or skipped required checks cannot be treated as passing.
Known unverified legacy surfaces must be reported clearly and remain
`NOT_READY` for UI-quality purposes until they have their own adapters.

## Commands and current enforcement

```sh
npm run quality:ui:source
npm run quality:ui:responsive   # after Studio desktop stylesheet build
npm run quality:ui              # source + desktop build + browser evidence
```

The source gate reads changed TSX/JSX against `origin/main` and checks
new static inline style objects, alt and accessible controls. The browser
gate mounts **the actual packaged Settings React components**, not static
screenshots. It captures all seven widths for Agents, Brand identity, Git &
PRs, Account and Customize, tests dialog/focus/close, samples rendered text
and input contrast, verifies minimum touch heights and checks overflow.
Artifacts live under `UI_QUALITY_OUTPUT` or a temporary evidence folder.
The existing SDK CI runs these checks before the release checks complete.

The source checker can accept other UI source paths. Every CMS generator,
artifact-backed interactive component, R2 theme materializer, app, and
desktop/host renderer must call an appropriate adapter and provide its own
rendered/interaction evidence before declaring *that target* UI-quality
ready. Do not treat Settings evidence as evidence for arbitrary themes.

**Exceptions:** Only time-limited, owner-attributed exceptions documented
in a receipt are permitted for legacy surfaces. Static inline styles in
newly generated components do not receive automatic grandfathering.
User-controlled Monaco editor font/theme configuration and runtime CSS
variable/mask values are not static style literals; preserve those
capabilities, and enforce CSP/provenance restrictions independently.
