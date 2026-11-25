# @inneranimalmedia/agentsam-work

Portable AgentSam Work contracts and React product surfaces for projects, tickets, mail, calendars, artifacts, and related host-driven work data. The package does not own a second persistence layer; host applications supply `WorkHost`.

## Exports

- `@inneranimalmedia/agentsam-work` — combined public API
- `@inneranimalmedia/agentsam-work/contracts` — host-neutral types and tokens
- `@inneranimalmedia/agentsam-work/client` — HTTP host adapter
- `@inneranimalmedia/agentsam-work/fixtures` — deterministic fixture host
- `@inneranimalmedia/agentsam-work/frontend` — React product surface
- `@inneranimalmedia/agentsam-work/theme.css` — theme token styles

## Host shell integration

WorkProduct supports two presentation modes:

- standalone (default): Work owns its own navigation shell for direct mounting.
- embedded: the host application owns global navigation/topbar and Work renders only the selected product surface.

Use presentation="embedded" when mounting Work inside an existing application shell. Use the exported --agentsam-work-* CSS variables to map Work into the host design system. Embedded mode intentionally does not render a second sidebar, topbar, right rail, mobile nav, or drawer.

## Workflow library surface

`@inneranimalmedia/agentsam-work/frontend` exports `WorkflowsSurface`. It is a
host-mounted library view, not a route or workflow API. The host supplies the
versioned workflow summaries and optional `onCreate`, `onOpen`, `onRun`, and
`onRetry` callbacks. Missing capabilities stay hidden; empty, loading and error
states are driven by the supplied data.

The editor itself is `WorkflowStudio` from
`@inneranimalmedia/agentsam-workbench/workflows`. A host opens that component in
its existing workspace/Side Stage and supplies its authoritative graph and
explicit host operations. Neither package creates a new workflow registry,
database table, endpoint, queue, or route.
