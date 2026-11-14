# ADR-0009: AgentSam Widget Platform Authority

Status: Proposed
Date: 2026-10-05

## Context

AgentSam already has a portable widget foundation in `@inneranimalmedia/agentsam-workbench`, Local Studio widget preferences, and persisted widget catalog/install/layout/preference state.

A donor application in `/Users/samprimeaux/agentsamweatherwidget-audit` demonstrates a much stronger widget operating model:

- polished widget cards;
- category taxonomy;
- size classes;
- add-widget/catalog UX;
- drag/snap interactions;
- long-press edit mode;
- contextual actions;
- theme-aware presentation;
- split-workbench layouts;
- plugin directory concepts;
- runtime, telemetry, queue, approval, workflow, artifact, cost, task, navigation, and utility widgets.

The goal is to graduate that experience into AgentSam without turning the donor application into a second application runtime or a second authority for runtime data.

## Decision

`@inneranimalmedia/agentsam-workbench` is the canonical portable widget UI/runtime authority.

The widget platform owns:

- `WidgetDefinition`
- `WidgetFrame`
- `GestureWidgetFrame`
- widget catalog metadata
- size classes
- categories
- supported surfaces
- widget status
- widget rendering
- widget library UI
- widget placement interactions
- widget configuration contracts
- demo adapters where appropriate

Domain packages own the real facts and actions projected into widgets.

Examples:

- queue data -> `@inneranimalmedia/agentsam-queue-control`
- run/task/workflow data -> AgentSam run / GOAP / work graph authority
- telemetry -> `@inneranimalmedia/agentsam-telemetry`
- runtime state -> AgentSam runtime / terminal / machine authority
- work/task content -> `@inneranimalmedia/agentsam-work`
- artifacts -> artifact authority
- approvals -> approval/policy authority

Widgets must not become duplicate data stores for those domains.

## Product surfaces

### Canonical library/configuration surface

`/settings/customize?view=widgets`

This surface owns:

- browse;
- enable/disable;
- install/uninstall;
- source status;
- default size;
- capabilities;
- placement preferences;
- configuration.

### Contextual use

Widgets may render wherever an eligible host supports them:

- AgentSam side stage;
- workbench;
- dashboard;
- project surface;
- contextual rails;
- future product surfaces.

The standalone `/widgets` route is not the canonical widget product surface.

## Source states

A widget may be:

- `demo`
- `local`
- `connected`
- `live`
- `needs_connection`
- `unsupported`
- `development`

A polished widget is not required to disappear merely because a production adapter is not complete.

Demo state must be explicitly identified.

## Theme law

Widgets consume AgentSam semantic design tokens.

A widget must not define its own independent application theme authority.

Changing the Local Studio theme must automatically update widgets.

## Desktop parity

Hosted Local Studio and packaged desktop must consume the same `@inneranimalmedia/agentsam-workbench` widget code.

A widget feature is not complete until it works in both.

## Portability law

A consuming application such as `user123` or `nextdashboardbuild567` must be able to:

1. install the widget package;
2. supply supported adapters/capabilities;
3. register eligible host surfaces;
4. render the same widget library and widgets;
5. inherit its own compatible semantic theme tokens.

The consumer must not need Local Studio-specific route code to use the widget system.
