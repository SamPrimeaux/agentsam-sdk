# AgentSam Widget Platform — Definition of Done

A widget migration is NOT complete because it renders inside Local Studio.

A widget/platform batch is complete only when the requirements below are satisfied.

## Canonical package authority

The reusable widget product surface is:

`@inneranimalmedia/agentsam-workbench/widgets`

Canonical source lives under:

`packages/agentsam-workbench/src/widgets/`

Local Studio must consume that package surface.

Local Studio must not become the canonical source of widget UI.

Do not create a second standalone `@inneranimalmedia/agentsam-widgets` package unless an ADR explicitly replaces this decision.

## Published package contract

`packages/agentsam-workbench/package.json` must expose:

- `./widgets`
- `./widgets/widgets.css`

The built package must contain:

- `dist/widgets/index.js`
- `dist/widgets/index.d.ts`
- `dist/widgets/widgets.css`

A dry npm pack and isolated package install must prove that a consumer can import:

```js
import * as widgets from "@inneranimalmedia/agentsam-workbench/widgets";
```

without reaching into repository source paths.

## Portable consumer proof

A non-Local-Studio example consumer must exist and compile using only package exports.

Required fixture:

`examples/widget-consumer/`

It must demonstrate:

- importing `@inneranimalmedia/agentsam-workbench/widgets`;
- rendering or at minimum resolving the canonical widget export;
- no imports from `apps/local-studio`;
- no imports from `packages/agentsam-workbench/src/*`.

If this fixture breaks, widget portability is broken.

## Donor graduation rule

The staged donor directory is a source/reference area, not the finished product:

`packages/agentsam-workbench/donor/weather-widget-platform/`

For each migrated widget:

1. preserve or improve donor visual quality;
2. move/refactor into canonical widget package structure;
3. register it in the canonical widget registry;
4. assign stable widget ID/category/sizes/surfaces;
5. provide explicit source state:
   - demo
   - local
   - connected
   - live
   - needs_connection
   - unsupported
6. use an adapter instead of embedding domain authority in the component;
7. add package tests;
8. prove it renders in the package consumer fixture;
9. prove it renders in Local Studio;
10. prove it renders in packaged desktop.

Do not delete useful donor UI merely because its live adapter is not ready.

A Demo adapter is acceptable when clearly labeled.

## Domain authority

Widgets visualize existing AgentSam capabilities.

Widgets must not create parallel databases or duplicate business/runtime authorities.

Examples:

- Queue Depth -> `@inneranimalmedia/agentsam-queue-control`
- Workflow / run progress -> GOAP / work graph / run authority
- Task Checklist -> real task/work state
- Token & Cost -> telemetry / usage / receipts
- Runtime State -> runtime / terminal / machine authority
- Operational Metrics -> telemetry
- Artifact Preview -> artifact authority
- Human Approvals -> approval/policy authority
- Scheduled Jobs -> jobs / automations / queue authority

## Local Studio product integration

Canonical management surface:

`/settings/customize?view=widgets`

The settings surface must support the real package registry rather than a route-local hardcoded widget list.

The standalone `/widgets` page is not the product authority.

Widgets must be usable from eligible surfaces without navigating to a widget application.

## AgentSam side-stage integration

`/agentsam` must be capable of opening a WidgetStage from the existing contextual side-stage/action menu.

The WidgetStage should support contextual views such as:

- Active Run Inspector
- Workflow Progress
- Task Checklist
- Human Approvals
- Token & Cost
- Queue Depth
- Runtime State
- Operational Metrics

The lead AgentSam conversation remains visible.

## Theme contract

Widgets consume canonical semantic AgentSam theme tokens.

Changing the selected Local Studio theme must update widgets automatically.

Do not create a second independently persisted widget theme authority.

Donor theme presets may be graduated into canonical AgentSam theme authority.

## Hosted/Desktop parity

A widget batch is incomplete until the same package code works in:

1. hosted Local Studio;
2. packaged Local Studio desktop.

Required flow:

`packages/agentsam-workbench`
-> `apps/local-studio`
-> Local Studio build
-> desktop-shell sync
-> Tauri/desktop smoke

Desktop may expose additional capabilities.

Desktop must not use a separate widget UI implementation.

## Package release proof

Local version alignment is NOT proof of release.

Before calling a release complete, verify the real npm registry.

For the current release version:

```bash
npm view @inneranimalmedia/agentsam-workbench@VERSION version
npm view @inneranimalmedia/agentsam-workbench@VERSION exports --json
```

The registry export map must contain `./widgets`.

Then install the exact registry version into an empty directory and prove the widgets subpath imports successfully.

Do not claim "released" merely because root `@inneranimalmedia/agentsam-sdk` was published.

## Required verification command

Before a Widget Platform PR is considered complete:

```bash
npm run verify:widget-platform
```

must exit 0.

An agent must not mark the work complete while this command fails.
