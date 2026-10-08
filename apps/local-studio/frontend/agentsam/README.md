# Local Studio AgentSam frontend

This directory owns the composed AgentSam application UI. `AgentSamShell.tsx` adapts application data/routing to `@inneranimalmedia/agentsam-nav`; `AgentSamPage.tsx` composes the conversation, existing composer, and Side Panel. `brand.ts` owns replaceable identity. `shell.css` maps navigation tokens to the existing app controls.

Routes in `frontend/src/routes/(apps)` are thin application adapters. `/cms` consumes `apps/client-cms-editor`; `/cad` loads the actual `apps/cad-creator` frontend built into generated public assets. CAD remains independently owned. Its runtime/API integration is outside this UI change.

The donor `agentsam.html`, `agentsam-page.js`, and `agentsam-page.css` are retained as reference material. Their commerce-specific shell and backend calls are not the reusable package contract.

For a fresh checkout, install the repository workspace dependencies and the independently locked `apps/cad-creator` and `apps/local-studio` dependencies with `npm ci` in each root. Local Studio's build then builds the CAD frontend into ignored generated assets. No CAD source is copied or forked.

## Deletion candidates after live UI approval

- `frontend/src/routes/_app.tsx` and `frontend/src/routes/_app/`: excluded legacy route tree; replaced by `(apps)` adapters. Remove together after approval.
- `frontend/src/components/shell/AppShellFrame.tsx`, its old navigation rail, and legacy TrailWorkspace layout: retire after confirming no callers outside the old routes. Keep shared CLI, resize, and offline components used by the new shell.
- Donor `agentsam.html`, `agentsam-page.js`, `agentsam-page.css`: archive or remove after confirming no external asset consumers. Keep any still-used icons/assets.
- Old bone-paper shell styles and duplicate navigation CSS: remove by selector/caller audit after CMS/editor views are verified; do not delete generic controls wholesale.
- Old CAD route and external-domain fallback: retire with `_app`; the active route now loads the built CAD application.

Do not delete the work store, composer, SideStage, browser, terminal, CMS package, CAD application, or backend deployment boundary. These remain active dependencies.

## Consumer portability

Ember Supply can mount the same package via React or `mountNav` in its plain JavaScript shell. Its routes, identity, account choices, and colorway are supplied by the host. No Ember Supply production files are changed by this integration. The nav package intentionally excludes its composer and plugin connections.
# Composer plugins and annotation

`PluginPicker` supplies one compact grouped capability/context menu for `+` and `@`,
with keyboard selection and minimal connected-service pills. `plugins.ts` projects
**the existing authenticated** `/api/connections` and the desktop connection
bridge through the portable `agentsam-workbench/capabilities` module. The one
`SIDE_STAGE_ACTIONS` list now powers the SideStage `+` and the composer's widget
entries, not two independent app lists. Enabled/visible plugin rows accept the
backend's boolean flags. OAuth requires connected status; native/binding plugins
require configured status and healthy runtime state. Skills/agents/MCP-only
records are shown only when a real host supplies discovered entries, never
from a fixture or Settings' local-only catalog overlays. An `@` mention is
contextual intent, not a tool invocation or permission grant. Missing provider
connections are offered through Settings, not silently substituted.

`AnnotationHelper` adapts the portable workbench `MiniAgentSam` to the current
conversation draft. The shell and browser toolbars start the same selection mode.
The helper inherits the selected theme and preserves iframe isolation. The chat
route currently streams provider text; automatic execution of mentioned plugins
still requires integrating the existing plugin runtime with that chat route.
The existing `/api/plugins/tools/execute` endpoint remains the execution authority.
