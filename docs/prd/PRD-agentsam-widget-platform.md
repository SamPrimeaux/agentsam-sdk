# PRD: AgentSam Widget Platform

Status: Draft
Date: 2026-10-05

## Product promise

AgentSam Widgets provide polished, reusable, context-aware UI projections of AgentSam capabilities and application state.

Widgets should make otherwise hidden runtime activity understandable and actionable without requiring the user to inspect terminals, logs, raw JSON, or internal control-plane state.

## Users

- AgentSam Local Studio users
- AgentSam desktop users
- SDK consumers
- future AgentSam-powered dashboards and applications

## Primary goals

1. Preserve and graduate the donor application's strong widget UI/UX.
2. Make widgets reusable across AgentSam surfaces.
3. Make Settings -> Customize -> Widgets the canonical management surface.
4. Add contextual widget viewing to `/agentsam`.
5. Support polished demo state while live adapters are still being connected.
6. Make live widgets project real package/domain authority.
7. Guarantee hosted/desktop parity.
8. Make the widget platform portable to third-party SDK consumers.

## Initial widget families

### Utility

- Countdown
- Precision Clock
- Calculator
- Quick Controls
- Studio Shortcuts

### Agent / Runtime

- Active Run Inspector
- Workflow Progress
- Task Checklist
- Human Approvals
- Token & Cost
- Runtime State

### Glance / Operations

- Operational Metrics
- Queue Depth
- Scheduled Jobs

### Content

- Artifact Preview
- Recent Items
- Content List

### Navigation / Commands

- Command Launcher

### Integration

- GitHub Activity
- Cloudflare Observability
- provider-backed external data widgets

## Widget lifecycle

A widget may progress through:

`demo -> local -> connected -> live`

without changing its visual identity or widget ID.

## Widget library requirements

The library must support:

- category filters;
- search;
- placed/enabled state;
- preview;
- supported sizes;
- supported surfaces;
- required capabilities;
- source state;
- configuration;
- install/remove;
- enable/disable.

## Interaction requirements

The platform should preserve or refine donor interaction patterns:

- drag;
- grid snap;
- long-press/click-hold edit mode;
- contextual actions;
- resize;
- collapse;
- hide/remove;
- semantic haptics where supported.

## AgentSam side-stage requirements

The `/agentsam` attachment/action menu should gain a `Widgets` entry.

Users must be able to keep the lead AgentSam conversation visible while opening widgets such as:

- Active Run Inspector
- Workflow Progress
- Task Checklist
- Token & Cost
- Human Approvals
- Queue Depth
- Runtime State
- Operational Metrics

The side stage should support multiple stacked widgets.

## Context-aware suggestions

The host may suggest widgets based on current state.

Examples:

- active run -> Active Run, Workflow Progress, Task Checklist, Token & Cost
- pending approval -> Human Approvals
- queue wait -> Queue Depth
- deployment/runtime operation -> Runtime State, Operational Metrics
- generated artifact -> Artifact Preview

Suggestions must not force-open UI without a host/user policy allowing it.

## Dynamic dashboard pattern

The donor Weather Agent's useful pattern is:

`user request -> structured data -> generated visual dashboard`

The weather-specific branding and Open-Meteo product identity are not part of the core product requirement.

The generalized capability should support AgentSam-generated dashboards for:

- release health;
- build failures;
- telemetry;
- cost;
- repository status;
- project/run state;
- other structured domains.

## Theme requirements

All widget surfaces must inherit the selected AgentSam theme.

The donor's six visual presets may be migrated into canonical AgentSam theme package authority.

No widget may maintain an independent saved theme system.

## Desktop requirements

The same widget package and Local Studio router must drive:

- hosted Local Studio;
- packaged desktop Local Studio.

Desktop may expose additional native capabilities, but not a different widget product.

## Acceptance criteria

A v1-quality widget platform requires:

- at least 15 donor widgets visibly available in the library;
- donor-style Widget Library implemented;
- WidgetStage available from `/agentsam`;
- at least 5 widgets using real AgentSam data;
- remaining migrated widgets visibly marked Demo/Needs Connection where applicable;
- six donor theme presets available through canonical theme authority or documented migration status;
- drag/snap/edit interactions functional;
- hosted Local Studio build passes;
- desktop sync/build/smoke passes;
- package exports documented;
- no hard requirement on Local Studio routes for third-party SDK consumers.

## System architecture requirements

The Widget Platform is not a collection of route-local React cards. It is a reusable package system composed from contracts, package contributions, host adapters, and user composition state.

### Package contribution model

First-party domain packages may optionally expose relevant widgets through a `./widgets` contribution surface.

A package contribution must:

- use `@inneranimalmedia/agentsam-contracts/widgets`;
- use stable, globally unique widget ids;
- identify its owner package/version;
- declare supported size classes and semantic surfaces;
- declare required capabilities;
- reference stable data/action adapter keys;
- never create a parallel WidgetFrame, layout engine, theme authority, or preference database.

Not every package needs a widget.

The initial product should prioritize widgets that make existing AgentSam machinery observable and actionable rather than creating decorative package badges.

### Registry composition

Workbench must support composing multiple package contributions into one runtime registry.

The registry must:

- reject duplicate widget ids;
- expose searchable category/package/source metadata;
- filter by host capability and surface;
- resolve known component keys without dynamic code execution from database metadata;
- make Demo, Needs Connection, Unsupported, Stale, and Error states visible.

### Persistence model

Widget composition state is distinct from domain runtime state.

Hosted Local Studio uses the existing D1 widget tables for:

- catalog projection;
- user installations;
- user layout;
- per-instance preferences.

Runtime facts such as queues, runs, approvals, telemetry, cost, artifacts, repository status, and content remain in their existing authorities.

Workbench must consume persistence through a host adapter so D1 is not required by third-party SDK consumers.

### Current D1 reconciliation requirement

The live `inneranimalmedia-business` database currently contains:

- `agentsam_widget_catalog`;
- `agentsam_widget_installations`;
- `agentsam_widget_layouts`;
- `agentsam_widget_preferences`.

The live catalog currently contains one `countdown` row. The installation/layout/preference tables contain no rows.

Wrangler still reports `1347_agentsam_widget_persistence.sql` as pending. Before production persistence writes are introduced, migration tracking must be reconciled with the already-existing remote schema.

No second widget persistence schema should be introduced.

## Package-to-widget product strategy

The platform should allow packages to expose widgets that make their real authority useful at a glance.

Priority examples:

- queue control -> Queue Depth / Queue Status;
- GOAP / work graph -> Workflow Progress;
- work -> Task Checklist / Active Work;
- analytics -> Token & Cost / Runtime Metrics / Usage;
- repository -> Repo Health / Index Status;
- knowledge -> Knowledge Index / Retrieval Health;
- approvals/control plane -> Pending Approvals;
- artifact authority -> Artifact Preview / Recent Artifacts;
- content/media -> Recent Content / Media Preview;
- Cloudflare connector -> Runtime / Observability;
- Brand -> Brand Health;
- Campaign -> Campaign Status;
- scoring -> Run Score;
- database editor -> Database Health;
- provider/key authority -> Connection Health without exposing credentials.

The donor widget components are visual/product references. Their names do not determine domain ownership.

## Widget runtime states

Every widget must resolve to an explicit state:

- `loading`;
- `ready`;
- `empty`;
- `stale`;
- `needs_connection`;
- `unsupported`;
- `demo`;
- `error`.

Demo values must never be presented as live data.

## Persistence user experience

For an authenticated Local Studio user:

1. the catalog loads eligible widgets from the host registry/catalog projection;
2. installing a widget creates a user-scoped installation;
3. moving/resizing/collapsing saves layout for the current semantic surface/breakpoint;
4. widget configuration saves validated preferences;
5. reload restores the same composition;
6. another signed-in browser session can restore the same composition.

For packaged desktop:

- the same Workbench widgets render;
- local SQLite provides offline persistence;
- authenticated sync may reconcile composition state to D1;
- the widget system does not depend on browser localStorage.

## Action safety

A widget action does not bypass package or host policy.

Actions that mutate real systems must use the same permission, approval, receipt, error, and audit mechanisms as the underlying AgentSam capability.

Widget preference/configuration storage must never contain provider credentials or other raw secrets.

## V1 system acceptance criteria

In addition to the visual acceptance criteria above:

- registry composition includes at least five independent first-party package authorities;
- at least ten library widgets are package/runtime-backed;
- at least five use real data adapters;
- duplicate widget ids fail tests;
- hosted Local Studio uses the D1 installation/layout/preference tables;
- the current localStorage preference map is no longer authenticated-user authority;
- cross-session persistence is proven;
- desktop uses the same Workbench UI/runtime with local persistence;
- a standalone package consumer renders a widget without Local Studio source imports;
- each widget-contributing package's exact released npm version exposes its widget entrypoint;
- registry export parity is verified after release.
