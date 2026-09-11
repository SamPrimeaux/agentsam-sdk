# Dashboard shell transplant

Source authority: `SamPrimeaux/inneranimalmedia` `main`, especially `app/dashboard/components/shell/AppShellFrame.tsx` and its related AgentSam dashboard components.

Local Studio does not copy the monolith frame verbatim. The production frame imports React Router, PWA/session gates, workspace-era state, dashboard-only contexts, and application-specific panels that do not belong in the standalone SDK app.

## Local authority

- `frontend/src/components/shell/AppShellFrame.tsx` — Local Studio composition root.
- `frontend/src/routes/` — TanStack Router authority; replaces donor `DashboardAppRoutes.tsx` and `lazyDashboardPages.tsx` routing responsibilities.
- `frontend/src/components/shell/` — app-specific shell chrome and navigation.
- `frontend/src/components/workbench/` — Local Studio adapters and concrete panes.
- `packages/agentsam-workbench/` — reusable AgentSam shell, agent, browser, terminal, and resizable-stage primitives.

## Donor-to-local mapping

| inneranimalmedia donor | Local Studio / SDK authority |
| --- | --- |
| `AppShellFrame.tsx` | `frontend/src/components/shell/AppShellFrame.tsx` |
| `DashboardActivityNav.tsx` | `frontend/src/components/shell/DashboardActivityNav.tsx` -> `nav-rail.tsx` |
| `DashboardSidebar.tsx` | `frontend/src/components/shell/DashboardSidebar.tsx` -> `studio-panels.tsx` |
| `IlluminatedResizeHandle.tsx` | `frontend/src/components/shell/IlluminatedResizeHandle.tsx` -> `split-handle.tsx` -> `@inneranimalmedia/agentsam-workbench/shell` |
| `WorkStage.tsx` | `frontend/src/components/workbench/side-stage.tsx` plus `packages/agentsam-workbench/src/shell/` |
| `BrowserView.tsx` | `frontend/src/components/workbench/browser.tsx` plus `packages/agentsam-workbench/src/browser/` |
| `XTermShell.tsx` and terminal hooks | `frontend/src/components/workbench/terminal.tsx`, `cli-drawer.tsx`, and `packages/agentsam-workbench/src/terminal/` |
| `ChatAssistant/*` | Local Studio chat/workbench components plus `packages/agentsam-workbench/src/agent/` |
| `/dashboard/agent/examples` prototype | rebuild as Local Studio explore/prompt catalog; do not make the donor iframe the product authority |

## Extraction rule

App-specific route/store/auth/session wiring stays in `apps/local-studio`. Reusable visual and interaction primitives move into `packages/agentsam-workbench`. Backend AgentSam, browser, terminal, Durable Object, and Cloudflare execution authority must remain behind explicit API/service contracts rather than being copied into frontend components.
