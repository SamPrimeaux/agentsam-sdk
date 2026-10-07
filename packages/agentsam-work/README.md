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
