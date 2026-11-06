# Design workspace boundary (Dynamic Design Canvas)

**Status:** Implemented portable boundary; specialist editor adoption is incremental. This is not a claim that every creation journey is production-ready.

The reusable product is **one creation workspace contract**, not a universal Canvas renderer. A Figma-style artboard, a CAD/OCCT viewport, a garment stage and a MovieMode timeline use different document models, tools, coordinates and rendering engines.

## Canonical ownership

| Concern                                                                        | Authority                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Authenticated principal, account and optional project/execution scope          | Existing AgentSam identity and \`agentsam.resource-scope.v2\`                   |
| Create/open/select/inspect/modify/save/preview capabilities and typed receipts | \`@inneranimalmedia/agentsam-contracts/design-workspace\`                       |
| In-process adapter composition (not a persisted registry)                      | \`DesignWorkspaceRegistry\`                                                     |
| Adaptive command bar, resizable panes, assistant and specialist stage slot     | \`@inneranimalmedia/agentsam-workbench/design\`                                 |
| Workspace entry/routing/deep links                                             | Each existing application host; document ID is stable, auth is always rechecked |
| Website/theme documents, sections, source renderers, draft/publication         | Ecommerce CMS site-scoped authority                                             |
| CAD geometry, 2D/3D selection, revisions, native engineering exports           | CAD Creator geometry/document/project authority                                 |
| Garment, print placement, variants, supplier/manufacturing state               | Product Studio/commerce authority                                               |
| Timeline, clips, playback, media source and render                             | CoPro/MovieMode authority                                                       |
| Source code, repo/files, build/deploy                                          | Existing authorized file, runtime and app adapters                              |
| Media bytes, attribution and derivatives                                       | Shared asset/media authority                                                    |

**Never:** store a second product document in the workbench, generalize geometry into web blocks, create a second CMS/asset/permission database, or silently fabricate an edit receipt.

## Framework-neutral operation flow

1. An existing host resolves the real authenticated \`AgentPrincipal\` and derives \`AgentResourceScopeV2\`. A project/workspace is optional and never becomes account ownership.
2. The host selects a _capability adapter_ based on the resource's kind. The in-process registry only routes calls to an injected existing engine.
3. \`open(scope, id)\` returns a resource address, canonical route, actual status, current/saved revision, selection and **only supported** capabilities. Do not advertise capabilities from a global list.
4. The host renders the owning product's editor/viewport/timeline inside \`DesignWorkspaceFrame.children\`. The frame **does not render or serialize** domain data.
5. Selection is a list of stable, opaque typed IDs; the domain inspector resolves real properties. The host may display selection while the specialist remains authoritative.
6. \`execute\` requires the real resource, declared capability and matching revision before the adapter is called. The adapter must enforce these again at its server authority.
7. Mutating operations return actual receipts naming operation, resource, prior and new revision. Progress/events are tied to operations, never made up by the shell.
8. Create requires an idempotency key and returns a **private draft** from the domain's existing create API. Atomic retry deduplication is the **domain backend's** job, not a local UI map.
9. Publish is a separate authorized operation with explicit user approval. Save and create are never publish.
10. Chat/Work, Side Stage and each specialist route may open the same resource, but must not fork a second independently editable revision.

## Existing CAD host integration

\`apps/cad-creator/frontend/src/app/CadCreatorApp.tsx\` already sends real \`cad.selection\` events through the checked guest bridge. \`apps/local-studio/frontend/src/lib/cad-host-bridge.ts\` validates the iframe source and origin, then projects those selections into \`DesignWorkspaceEvent\` (no invented object model). The host's App Preview Stage renders the actual CAD iframe and displays the selected native object kind. A deselection propagates an empty selection.

This is **selection-context integration**, not generic CAD editing or a new geometry API. Geometry operations still use the existing CAD services. The current explicit proposal-approval/revision guard remains in force. Read-only hosted projects do not become writable because a user can see a selection.

## Consumer rules

- An embedded editor owns its own interaction grammar, pointer controls, keyboard shortcuts, selection geometry, inspector fields, zoom and document serialization.
- The workbench owns adaptive pane arrangement; product-specific rail content and toolbar actions are **injected**, not implemented in shared code.
- A host can adopt the shared frame without moving its engine to the SDK or depending on another application checkout. The pinned distributable must contain all required packages.
- Consumers should import \`@inneranimalmedia/agentsam-workbench/design/design-workspace.css\` for the frame styles. The component does not import CSS so Node/SSR consumers can render safely.
- Loss of authorization, unavailable providers, failed writes and stale revisions fail visibly; never load a different customer's or fallback fixture document.

## Implemented vs remaining

**Implemented in this change:** typed common contract, authority/receipt preflight, injected registry, shared responsive frame, CAD selection-to-workspace event bridge, cross-origin checks and focused tests.

**Not implemented by this change:** domain-backed \`+ New\` routing across CMS/CAD/product/media, idempotent server-side create for every domain, progressive generated pages, production-ready design-tool artboard editing, site publication, CAD parametric edits through the new adapter, Product Studio / MovieMode frame adoption, live integrated responsive browser acceptance.

The existing Fortune500 merchant first-paint worktree is separate and must be reconciled before a shared UI rollout. Future specialist adoption must pass a real create → edit → save → reopen journey _on its authenticated hosted route_ before it is called shipped.

## Acceptance gates

- Account A cannot open or mutate account B's resource. No fixture fallback.
- A stale revision fails without applying a mutation.
- Save does not publish; publish requires explicit authorization and approval.
- The CAD selection event matches the actual selected geometry ID, including deselection. CAD remains CAD.
- A MovieMode timeline inside the frame remains a timeline, not generic artboard tiles.
- On a narrow workspace, only one bounded pane is visible, and closing the assistant restores available stage space.
- Every installed adapter reports actual declared capabilities; unavailable features remain unavailable.
- End-to-end browser/mobile/deployed verification is still required for shipment.
