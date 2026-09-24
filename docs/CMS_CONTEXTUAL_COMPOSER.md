# CMS Editor — Agent Sam Contextual Composer

24 Sept 2026 · build target for `apps/client-cms-editor` (agentsam-sdk), proven on Fuel & Free Time, then brought into Inner Animal Media.

## Ideal-state packages (FNF = proving ground)

These FNF packages are **examples of the ideal state**, not permanent homes. Each becomes an SDK-packaged prebuild:

| Proving ground (FNF) | SDK target | Role |
|---|---|---|
| `packages/agentsam-workbench` | `@inneranimalmedia/agentsam-workbench` | miniAgentSam + contextual composer |
| `packages/heuristic-theme` | `@inneranimalmedia/heuristic-theme` | **Stock CMS theme preset** |
| `packages/commerce-analytics` | `@inneranimalmedia/commerce-analytics` | Commerce analytics surfaces |

`agentsam create … --preset cms` should land on **heuristic-theme** as the basic stock theme.

## Interaction loop (required)

1. **Select** an object on the live canvas.
2. **Ask** (or agent proactively offers) — right panel scopes to selection.
3. **Suggest** — one primary suggestion card (action title + rationale + chevron), not a chat wall.
4. **Accept** (card click) → generation starts (no extra confirm).
5. **Generate** — polished gradient overlay on canvas + contained monospace code stream with soft gradient veil (trust/transparency, not approval UI). Phases: Reading selection → Drafting markup → Writing styles → Wiring settings.
6. **Land** — gradient cross-fades to real block; left inspector flashes updated fields; composer posts confirmation.

Left panel is always a real layers tree + property inspector (text, layout, typography preset, appearance, padding, remove) bound to the **same** block model the agent edits.

## Implementation

- Primitives: `packages/agentsam-workbench/src/agent/ContextualComposer.tsx` (+ CSS)
- Host wiring: `apps/client-cms-editor/frontend/src/CmsAgentSurface.tsx` with `contextual`
- Threads persist per page/site via `localStorage` (survive redock/resize — portable agent)

## Open decisions (from spec)

- Generation preview dock: default **inside right composer**; canvas keeps the gradient overlay.
- Threads: persisted per project key; scoped optionally to selection without discarding other threads.
- Pipeline: host-owned `planSuggestion` / `runGeneration` (AgentSam runtime / MCP) — demos ship with local stubs.
