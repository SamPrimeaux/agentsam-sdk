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
