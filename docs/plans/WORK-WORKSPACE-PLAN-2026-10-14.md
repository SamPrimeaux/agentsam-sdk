# AgentSam Work — one workspace (Tickets · Projects · Calendar · Timeline)

Branch: `feat/work-workspace-crud-20261014` (merged as PR #215) · Status: shipped Work CRUD/web+desktop baseline; remaining phases explicitly tracked in section 15.

## 0. Goal and rules

Tickets, Projects, Calendar and the Gantt/timeline are ONE workspace, not competing pages. Selecting a project filters tickets, a ticket with dates shows on the calendar and the timeline, a calendar event opens its ticket.

Hard rules (from Sam):
- Full CRUD on every entity, in web AND desktop. No dead buttons: a control either works or is not rendered (capability flags).
- Reuse existing tables/columns. No invented schema, no lookup/vocab tables.
- Theme comes from the Local Studio host tokens. No hardcoded white/dark.
- A fresh install (newuser123) must get a working, empty, fully editable workspace. No fixtures, no sample cards, no Sam-specific copy.
- Web and the installed desktop app ship the same fixes (same package, same contract test).
- No local .bak copies; git is the backup. Prune the branch when merged.

## 1. What exists today (audit, 2026-10-14)

| Piece | Where | State |
|---|---|---|
| Tickets UI | `packages/agentsam-work/src/frontend/surfaces/TicketsSurface.tsx` | Sort / Refresh / New ticket have no handlers; board mode unwired; checkboxes uncontrolled; no `onOpenTicket` on `/tickets` |
| `/tickets` empty | `WorkProduct.tsx` passes `scope="collaborate"`; worker maps every non-collaborate row to `platform` | Engineering tickets filtered out; header analytics (from all rows) disagrees with the empty list |
| Hardcoded copy | TicketsSurface "Recommended execution order", "Dependency sketch" | Sam's internal ticket names baked into a published package |
| Projects UI | `ProjectsSurface.tsx` (agentsam-work) | Read-only; `+` does nothing; no create/edit/archive in host contract, worker or Rust allowlist |
| Calendar | `CalendarSurface.tsx`; worker returns `calendar: []` | No data source, no event endpoints, not clickable |
| AutoRAG pill | `LocalStudioWorkPage.tsx` absolute-positioned button over the breadcrumb | Overlaps "Work / Projects"; modal shows green checks while erroring |
| Timeline | `apps/project-control` + `agentsam-workbench/{projects,timeline}` | Beautiful, 100% hardcoded demo data, never wired; second `ProjectsSurface` duplicates the live one |
| `work-graph` | `packages/work-graph` | Pure model + gantt projection; NO tickets adapter |
| Desktop | `agentsam-desktop-shell`, bundles `desktop-dist` | Installed app is a frozen Oct 8-9 frontend; work calls go through a Rust allowlist (snapshot, tickets, mail only) |

## 2. Donor map (inneranimalmedia monolith -> SDK)

Port the behavior, strip monolith specifics (workspace_members, IAM Meet, Google connect become optional providers).

| Capability | Donor (monolith) | Lands in |
|---|---|---|
| Ticket CRUD, status, links, events, analytics | `backend/agentsam/api/tickets.js` (GET list, GET analytics, POST, GET/PATCH/DELETE :id, POST :id/status, POST :id/link, GET/POST :id/events) | `apps/local-studio/backend/worker/work-service.js` (split into `work/tickets.js`) |
| Task editor (doc, due, project, client, schedule, complete, delete) | `pages/launch-desk/CollaborateTaskFocus.tsx`, `CollaborateTasksPanel.tsx` | new `TicketEditor` in `agentsam-work` (drawer / full page) |
| Project catalog + detail + quick stats | `pages/projects/ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `ProjectQuickStats.tsx`, `src/api/projects/index.js` | `ProjectsSurface` + `ProjectDetailSurface` + worker `work/projects.js` |
| Calendar view, quick event, events CRUD, tasks-on-calendar | `components/CalendarPage.tsx`, `LaunchDeskPage.tsx` (Quick event), `src/api/calendar.js` (view, POST/PUT/DELETE events) | `CalendarSurface` + worker `work/calendar.js` |
| Gantt / timeline | `apps/project-control` + `agentsam-workbench/timeline/GanttBoard` | project-detail "Timeline" tab and Tickets "Timeline" mode |

## 3. Data layer: one contract, two stores, honest fallback

### 3.1 Contract
`WorkStore` interface (in `agentsam-work/contracts`), implemented twice. The UI only ever talks to `WorkHost`, which wraps a `WorkStore`. Snapshot gains `source: "hosted" | "local"` and `capabilities: { tickets: {create,update,delete}, projects: {...}, calendar: {...}, github: bool, googleCalendar: bool }` so surfaces hide what a store cannot do.

### 3.2 Tables (reuse, mirror prod shapes)
- `agentsam_tickets` — already in `migrations/d1/0010_portable_tickets_memory.sql`. Columns already cover the timeline: `start_at`, `due_at`, `estimated_minutes`, `percent_complete`, `parent_ticket_id`, `blocks`, `blocked_by`, `owner_kind/owner_ref`, `client_id`, `project`, `surface`, `status_reason`. No schema change for Gantt.
- `projects` and `calendar_events` — exist in prod D1 (monolith) but are NOT in SDK migrations. A fresh install would have no table, so the worker silently returns empty. Plan: ship ONE portable migration (`CREATE TABLE IF NOT EXISTS`) that mirrors the prod column names exactly, so identical code runs against prod D1 and fresh installs. Step 1 introspects prod (`PRAGMA table_info`) before writing it; we mirror, we do not design.
- Ticket events (`/events`) reuse whatever the monolith already writes; confirm in step 1.

### 3.3 Resolution order (fallback logic)
1. Hosted account connected (web, or desktop signed in): D1 via `/api/work/*` and `/api/tickets|projects|calendar/*`, scoped by `auth_users.id` (single owner authority, no workspace_id).
2. Desktop, signed out OR hosted unreachable (401/5xx/timeout): local SQLite (`~/.agentsam/work.db`) through agentsamd using the existing `local-sqlite-bridge` ops (`open_agentsam`, `query`, `insert`, `update`, `delete`). Migrations auto-apply on launch (`migrations/runtime` is already bundled in `tauri.conf.json`).
3. Web, signed out: empty state with Sign in / Get the desktop app. Never fixtures.
- Every response carries `source`; the toolbar shows a small "Local" / "Hosted" badge. Writes always go to the active store.
- RESOLVED (see section 13): hosted D1 is the single source of truth for a signed-in owner; web and desktop are two windows on the same rows. Local SQLite is (a) the real store only when no account is connected and (b) a read-only offline cache when signed in. No two-way sync, no conflicts.
- First run seeds nothing fake. One real, deletable "Getting started" project + ticket created through normal CRUD so the screens are not blank and the owner can delete them.

## 4. CRUD matrix (hosted route = local op = Rust allowlist entry)

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Ticket | POST /api/tickets | GET /api/tickets, GET /:id, GET /analytics | PATCH /:id, POST /:id/status, POST /:id/link | DELETE /:id |
| Ticket events | POST /:id/events | GET /:id/events | — | — |
| Project | POST /api/projects | GET /api/projects, GET /:id | PATCH /:id (name, status, progress, cover, repo, star) | archive (default) + hard delete with confirm |
| Calendar event | POST /api/calendar/events | GET /api/calendar/view?from&to | PUT/PATCH /events/:id (drag/resize) | DELETE /events/:id |

Desktop: add every path above to `local_identity.rs` ("work" operation) AND to its test list; a CI contract test asserts that every method in `WorkHost` client has a matching allowlist entry and a worker route, so web and desktop cannot drift again. Also allow `/api/work/snapshot` without a `surface` param (currently rejected with `mail_connection` alone).

`WorkHost` additions: `deleteTicket`, `createProject`, `updateProject`, `deleteProject`, `createEvent`, `updateEvent`, `deleteEvent`, `listEvents(range)`.

## 5. UI plan

Shared: one `WorkSelectionStore` in `WorkProduct` (active project, active ticket, calendar range) so the surfaces cooperate. Deep links stay URL-based (`/tickets?project=…&ticket=…`) so browser back works.

**Tickets**
- Fix scope: `/tickets` shows all tickets by default; `platform` / `collaborate` become a filter chip, not a hard scope.
- Modes: Queue, Board (drag between status columns = PATCH status), Timeline (work-graph + GanttBoard).
- Real sort / filter / refresh; New ticket opens the editor; controlled multi-select with bulk status + delete.
- Editor = donor task focus: title, documentation, status, priority, project, client, due, start, estimate, % complete, blocked-by, Schedule on calendar, Mark complete, Delete (confirm).
- "Recommended order" and "Dependency sketch" are DERIVED by a new `work-graph` tickets adapter (priority -> blocked_by/blocks topological order -> in_review first). Zero hardcoded text.

**Projects**
- Visual base: the workbench catalog (the clean one Sam approved) wired to live data. Delete the duplicate `ProjectsSurface` after both are compared.
- `+ New project` and card menu: edit, star, archive, delete. Tabs All / Active / Shared / Archived are real filters.
- Project detail = donor: quick stats (time, open tickets, progress), task list, Calendar and Tickets shortcuts, Timeline tab, codebase-index card, brand assets, memory/instructions only if the store reports the capability.

**Calendar**
- Today the grid is inert and fed `[]`. Plan: click/drag a cell opens Quick event (donor: event / task / focus / meeting / out of office, start/end, guests optional); save = POST; click an event = edit popover; drag/resize = PATCH; delete in popover.
- Tickets with `due_at` / `start_at` render as task events (color by project); clicking opens the ticket editor; dropping a ticket on a day sets `due_at`.
- Week / Month / Day, mini-month, Today, keyboard nav. Google sync and IAM Meet appear only if `capabilities.googleCalendar` is true.

**AutoRAG**
- Remove the absolute pill (overlaps the breadcrumb). Move it into the project detail "Codebase index / Knowledge" card as a normal button.
- Rewrite the modal states honestly: no green checks before anything ran. On web: a clear "Runs in Local Studio Desktop" card with an `agentsamstudio://` open link instead of a form that cannot submit. On desktop: the real inspect flow.

## 6. Gantt flexfit (root causes found in `project-control.css`)

Defects: table `min-width: 1165px` with fixed `280px 125px` columns; inspector fixed `330px` squeezes the timeline to ~2 columns at 1200px windows; `min-height: calc(100dvh - 248px)` hardcodes the shell height; day columns `minmax(64px,1fr)` ignore container width.

Fixes:
- Size from the container, not the viewport: `container-type: inline-size` on the Gantt root and `@container` breakpoints.
- Zoom presets (Day / Week / Month) plus "Fit to range" computing day width with a ResizeObserver.
- Task column keeps priority; Owner column collapses under ~720px; progress % hides under ~560px.
- Inspector becomes an overlay/bottom sheet under ~900px container width; fixed side panel only above.
- Height = `flex: 1; min-height: 0` inside the shell, no `dvh` math. Sticky date header and frozen task column.
- Test widths: 360, 768, 1024, 1280, 1728, plus desktop window at its 1200x800 default.

## 7. Theme (honor Local Studio)

- Today: two token namespaces (`--agentsam-work-*` in agentsam-work, `--as-work-*` in workbench) and hex values in `theme.css` (13), `ProjectsSurface` (1), `CalendarSurface` (7), `ArtifactsSurface` (7), `MailSurface` (2), `project-control.css` (36).
- Plan: ONE namespace derived from the host tokens (`--background`, `--card`, `--foreground`, `--border`, `--accent`, `--destructive`, `--radius`, `--font-sans`). Hex fallbacks live in a single `:where(.agentsam-work)` defaults block that only applies when no host tokens exist (standalone). Status/warning/phase colors via `color-mix()` from host accent and destructive.
- Light/dark follow the host theme class/attribute, never `prefers-color-scheme` alone.
- A test fails CI if a hex or rgb literal appears outside the defaults block.
- Verify against every Local Studio theme preset, in web and desktop.

## 8. Desktop alignment

The desktop bundles `desktop-dist` (frozen). Every phase that touches UI ends with: `build:desktop-assets` -> `sync-local-studio-dist` -> Tauri bundle -> updater publish (`updates.inneranimalmedia.com`) -> install and click through the same checklist as web. Worker-only changes reach desktop immediately; UI and Rust allowlist changes need the rebuild. Lockstep version bump so a mismatch fails before deploy.

## 9. work-graph and project-control

- Add `adapters/work/tickets.js` (ticket -> WorkItem, `blocked_by/blocks` -> dependencies, dates -> start/end, percent_complete -> progress). Write it in TypeScript per Sam's preference.
- Resolve the private/public contradiction (README says private; `publishConfig` and the catalog manifest say public).
- `apps/project-control` is retired once the Timeline tab lives in Local Studio (keep nothing that has fake data).

## 10. Phases (each ends with web + desktop verification)

0. Branch + single-React build fix (done on this branch). Do not touch the unrelated `feat/offline-cli-knowledge-catalog` WIP.
1. Introspect prod schema; portable migration for `projects` / `calendar_events`; `WorkStore` contract; hosted D1 store with full routes; local SQLite store; allowlist + contract test. Accept: curl CRUD for all four entities on both stores.
2. Tickets: scope fix, tickets adapter in work-graph, editor, board, sort/filter/bulk, delete.
3. Projects: catalog swap, create/edit/archive/delete, detail page, remove duplicate surface.
4. Calendar: clickable grid, quick event, drag/resize, tickets on calendar.
5. Timeline: Gantt wired to tickets and project detail, flexfit fixes.
6. Theme unification + hex lint; AutoRAG relocation and honest modal.
7. Desktop build, updater publish, installed-app acceptance run; fresh-profile test (new user, no network) proving the local store works with nothing configured.

## 11. Decisions (all resolved, see section 13)

1. v1 local vs hosted: separate workspaces, no sync (recommended), or build sync now?
2. OK to mirror prod `projects` and `calendar_events` into a portable SDK migration (same names/columns)?
3. Projects catalog base: workbench look (recommended) vs current agentsam-work look.
4. Delete semantics: archive by default, hard delete behind a confirm (recommended)?
5. Google Calendar / Gmail: optional providers behind capabilities (recommended) for v1.

## 12. Risks

- Prod `projects` has no account column guarantee (the worker already falls back to "all readable rows"); the new store must always scope by owner.
- Local SQLite path requires agentsamd running; first-run errors must be visible, not silent.
- Two React copies in bundles recur whenever workspace packages resolve react differently; keep the alias fix and add it to the Local Studio build too.

## 13. Resolved decisions and prod findings (2026-10-14)

Decisions (Sam):
1. One dataset. Hosted D1 (`inneranimalmedia-business`, the worker's `DB` binding) is the source of truth; desktop and web both read/write it. Local SQLite = no-account store + offline read cache. Offline edits while signed in are blocked with a clear read-only banner (no sync engine in v1).
2. Mirror prod `projects` and `calendar_events` into a portable migration: YES.
3. Projects catalog uses the workbench look: YES.
4. Google Calendar and Gmail are optional providers behind capability flags, built now (OAuth clients for desktop and web already exist).

Prod schema findings (read-only queries against `inneranimalmedia-business`):
- `agentsam_tickets`: 666 rows, 665 with `account_id IS NULL`, 1 owned by Sam's auth user. The SDK worker filters `WHERE account_id = ?`, so it can return at most 1 ticket; the other 665 (654 `platform`) are invisible. Surface values in prod are not only platform/collaborate (`dashboard`, `execos`, `projects`, `worker`, `dashboard/images/videos`); the worker collapses them all to `platform`, losing information.
- `projects`: 39 rows; 30 have `owner_user_id IS NULL`; 9 belong to four aliases of Sam (`au_...`, `sam_primeaux`, `usr_sam_iam`, `usr_sam_primeaux`). The worker queries nonexistent columns (`account_id`, `owner_id`, `user_id`), the query throws, and its catch-fallback returns ALL rows. It only looks correct because Sam is the only user; it is a cross-owner leak the moment a second user exists. Status CHECK is `discovery|design|development|qa|staging|production|maintenance|archived` (the worker maps to a different set and loses `development`, `qa`, `staging`, `maintenance`). `project_type` CHECK is `dashboard|landing-page|saas-product|e-commerce|internal-tool|template`.
- `calendar_events`: 61 rows (43 Sam, 17 NULL user, 1 other). `tenant_id NOT NULL`; `user_id`, `project_id` (FK -> `projects`), `client_id` (FK -> `clients`), `event_type` CHECK (`meeting|deadline|reminder|task|client_call|personal|travel|other`), `start_datetime`/`end_datetime` TEXT, `status`, `color`, `priority`, Google fields `calendar_source`, `external_event_id`, `sync_account`.
- Gmail OAuth exists in the SDK (`gmail-service.js`, scopes `gmail.modify` + `gmail.send`). There is NO Google Calendar code or scope in the SDK; it exists only in the monolith (`/api/integrations/google-calendar/connect`, `calendar.js` google status/sync).

Consequences for phase 1:
- Portable migration = a SUBSET of prod columns, same names and same CHECK values, so identical queries run on prod and fresh installs. Leave out monolith-only columns (`supabase_sync_*`, `hyperdrive_id`, `mcp_service_id`, `d1_databases`, `r2_buckets`, `worker_id`, `workspace_id`, etc.). Drop the `clients` FK on `calendar_events.client_id` (no `clients` table on fresh installs) or ship a minimal `clients` mirror: decide when writing the migration. Writers set `tenant_id` = owner auth user id.
- Ownership backfill (PROD WRITE, needs Sam's explicit approval before running; prepared, not executed):
  - `agentsam_tickets.account_id` for the 665 NULL rows -> Sam's auth user id
  - `projects.owner_user_id` for the 30 NULL rows and the 4 legacy aliases -> Sam's auth user id (client projects stay visible through `client_id`)
  - `calendar_events.user_id` for the 17 NULL rows -> Sam's auth user id
  The id is taken from the signed-in session at run time, never hardcoded in code. Stage as a one-off script under `scripts/` using the d1 write tool, with a dry-run count first and row counts verified after.
- Worker queries are rewritten to scope strictly by owner (no "all rows" fallback), pass `surface` through unchanged, and use the prod status/type vocabularies.
- Google Calendar: reuse the existing Google OAuth client, add the calendar scope, port `google/status` + `google/sync` from the monolith, store linkage in the existing `calendar_source`/`external_event_id`/`sync_account` columns. `capabilities.googleCalendar` is true only when a token with that scope exists. Gmail already follows this pattern.

## 14. Status handoff (2026-10-14)

DONE (tested locally)
- Prod ownership backfill ran and was verified (tickets 666, projects 39, events 60 owned by Sam's auth user).
- Worker data layer: apps/local-studio/backend/worker/work-schema.js, work-data.js (owner-scoped CRUD for tickets, projects, calendar events), work-sqlite-d1.js (node:sqlite D1 shim), work-data.test.mjs (7 passing). work-service.js delegates to it; snapshot adds source, capabilities, calendar events.
- packages/agentsam-work: contracts, client (createWorkCrud shared by all transports), new surfaces (Tickets queue/board/timeline + editor, Projects catalog + editor + delete dialog, ProjectDetail tabs, Calendar week/day/month with create/drag/edit, TimelineView), theme without literal colors (test enforces). tsc, build and package tests pass.

TODO, in order
1. apps/local-studio/frontend/src/components/work/LocalStudioWorkPage.tsx: add the new WorkHost methods to the desktop host using createWorkCrud(request) from @inneranimalmedia/agentsam-work/client; http host already inherits them. Remove the absolute-positioned AutoRAG button; pass it via WorkProduct headerActions (projects) and knowledgeAction (project detail). Fix the AutoRAG modal (agentsam-workbench/knowledge) so it shows no green checks before anything ran, and on web explains it runs in Local Studio Desktop.
2. packages/agentsam-desktop-shell/src-tauri/src/commands/local_identity.rs: allow /api/projects, /api/projects/:id, /api/calendar/events, /api/calendar/events/:id, and /api/work/snapshot with from/to/mail_connection params (also no-surface). Add them to the allowlist test list. Add a contract test that every createWorkCrud route is allowlisted.
3. Run apps/local-studio typecheck and vite build; fix type errors (apps/local-studio/backend/server/work/contracts.ts and service.ts also import Work types).
4. Local SQLite fallback for desktop when signed out or offline: run work-data.js over work-sqlite-d1.js in a node bridge (see packages/agentsam-database-editor/scripts/local-sqlite-bridge.mjs), route from the Rust "work" operation, snapshot source: "local", read-only cache when signed in and offline.
5. Google Calendar provider (capability googleCalendar): port google status/sync from inneranimalmedia src/api/calendar.js using the existing Google OAuth client; synced events are already read-only.
6. Delete apps/project-control once nothing imports it. Resolve work-graph private/public and add a tickets adapter.
7. Deploy worker, then desktop: cd packages/agentsam-desktop-shell && npm run bundle:app, install and click through tickets, projects and calendar on web and desktop.

## 15. Release receipt — 2026-10-15

- GitHub PR #215 merged to main at `5509b5eb`; work feature commit `7183f468`, mobile/desktop parity commit `1091ae39`.
- Cloudflare Worker `agentsam-sdk` deployed on `agentsam.inneranimalmedia.com` with version ID `4ffd9c5c-0ee3-4056-bf35-7ce744c78320`.
- Live unauthenticated smoke: `/projects` HTTP 200, `/tickets` HTTP 200; `/api/work/snapshot` HTTP 401 without a session (expected).
- Owner/backfill verified on production D1 after deployment: 666 tickets, 39 projects, 61 calendar events, zero NULL-owner rows in each (61 calendar total includes one separate user's event).
- Work UI: real project/ticket/calendar CRUD, ticket views, responsive Gantt, mobile Quick Create for task/project/event, project search and sorting, adjustable perceived completion and project color. The existing five-item mobile dock is preserved.
- Shared desktop transport uses `createWorkCrud(request)`; Rust Work route allowlist includes project/calendar CRUD and DELETE. The same Work UI package is used for web and desktop.
- Quality gates: Work package 8/8 tests; work-data 7/7 tests; frontend TS check passed; targeted Rust work bridge test passed; desktop asset build and headless desktop shell smoke passed; Cloudflare dry-run passed.
- iOS viewport check: explicit 390x844 device metrics, 390px document/shell/dock widths, five dock buttons, six fixture project cards. The fixture does not expose CRUD capability, so it cannot prove the blue Quick Create button interaction; authenticated iOS click-through remains an acceptance action.
- Tauri `.app` built for Apple Silicon, ad-hoc locally signed and zipped in `~/Downloads/AgentSam-Local-Studio-WorkV1-5509b5eb-macOS-arm64.zip`. Bundle verifies locally but is not Apple Developer-signed/notarized, and is NOT published to the updater. Treat as a local test installer, not a public release.

### Outstanding work (do not report as shipped)
1. Authenticated iPhone click-through of Tickets, Projects, + Quick Create and modal persistence; optimize any remaining rough interactions.
2. Installed desktop app sign-in and live account data acceptance: project/ticket create/edit/archive across desktop and web, same owner-scoped rows; confirm all new Rust paths through the installed service bridge.
3. Desktop offline/signed-out SQLite store and read-only signed-in cache. Do not create diverging signed-in datasets.
4. Google Calendar OAuth scope and event sync (Gmail connection already exists). Keep optional provider capabilities honest.
5. Milestones, reusable/versioned Templates, richer saved filters, verified progress and cross-project dependency presentation.
6. Real Apple signing/notarization and updater publication once credentials and release versioning exist. Do not promise automatic desktop updates before this.
