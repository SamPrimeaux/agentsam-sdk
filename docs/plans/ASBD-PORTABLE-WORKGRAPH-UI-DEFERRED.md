# Portable WorkGraph / Gantt UI — deferred

**Priority:** low (plan only — do not block ASBD home / help / CMS work)

## Intent

Salvage `agentsam-lab` `prototype-gnantt.html` into a **lightweight portable UI** that can mount inside:

- `apps/local-studio` work surface
- optional CLI-adjacent localhost monitor for AgentSam agent work
- future package distribution (not required for first cut)

## Constraints

- Visual shell must use **ASBD** (`asbd-tokens` / header/footer or studio nav from `@inneranimalmedia/agentsam-nav`) — not the purple lab prototype tokens as SSOT
- Keep WorkGraph data contract aligned with `agentsam-sdk/packages/work-graph` (canonical; lab copy is stale)
- No new product world; this is a reusable widget, not a standalone app

## Suggested peel

```text
packages/agentsam-workgraph-ui/   (or apps/local-studio/frontend widget)
  ├── board/ list/ gantt projections
  ├── ASBD token mapping
  └── mount API for Studio + static preview
```

## Non-goals now

- Full rewrite of lab Worker
- Shipping Gantt as the AgentSam marketing homepage
- Blocking packages/services help page publish

Resume after ASBD home + help/doc pattern are live on `agentsam.inneranimalmedia.com`.
