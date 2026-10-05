# Widget Platform Donor Graduation

## Source

Donor:

`/Users/samprimeaux/agentsamweatherwidget-audit`

Target repository:

`/Users/samprimeaux/agentsam-sdk`

Primary target package:

`packages/agentsam-workbench`

Primary product hosts:

- `apps/local-studio`
- `packages/agentsam-desktop-shell`

## Mission

Do not redesign the donor from memory.

Preserve the visual quality demonstrated by the running donor at localhost before refactoring.

The migration goal is to retain the polished UI/UX while replacing demo-specific application authority with reusable AgentSam contracts and adapters.

## UI/UX reference

Preserve/refine:

- dense polished cards;
- consistent headers;
- icon/category/version metadata;
- collapsed/expanded states;
- multiple size classes;
- catalog search/filter UX;
- Add Widget modal;
- placed state;
- preview/configuration panel;
- drag/snap layout;
- long-press/click-hold edit mode;
- contextual actions;
- split workbench widget rail;
- theme-aware surfaces;
- plugin directory information architecture.

Do not reduce migrated widgets to generic settings cards.

## Target package structure

Suggested:

packages/agentsam-workbench/src/widgets/
  definitions/
  adapters/
  gestures/
  library/
  surfaces/
  themes/
  utility/
  glance/
  runtime/
  content/
  navigation/
  integrations/

Do not create a second standalone app for widgets.

## Migration phases

### Phase 1 - preserve donor platform UX

Migrate/adapt:

- GestureManager
- GestureWidgetFrame
- haptics
- Widget Library modal
- size classes
- taxonomy
- WidgetFrame enhancements
- edit mode
- drag/snap behavior

Keep donor demo data functional during this phase.

### Phase 2 - migrate visible widgets

Bring the visible donor widgets into package authority.

Do not wait for live adapters before making them visible.

Every widget must have an explicit source status.

### Phase 3 - Settings integration

Make:

`/settings/customize?view=widgets`

the canonical library/configuration surface.

The current standalone `/widgets` route should eventually redirect or disappear.

### Phase 4 - AgentSam WidgetStage

Add `Widgets` to the `/agentsam` side-stage/action menu.

Allow stacked contextual widgets while preserving the lead conversation.

### Phase 5 - real adapters

Prioritize:

1. Active Run Inspector
2. Workflow Progress
3. Task Checklist
4. Human Approvals
5. Token & Cost
6. Queue Depth
7. Runtime State
8. Operational Metrics
9. Scheduled Jobs
10. Artifact Preview

### Phase 6 - dynamic dashboard composition

Generalize the donor Weather Agent interaction pattern into provider-neutral dynamic dashboard composition.

Do not retain Weather Agent as the identity of the feature.

## Package authority mapping

- Queue Depth -> agentsam-queue-control
- Scheduled Jobs -> job/automation/queue authority
- Active Run -> run/GOAP/work graph authority
- Workflow Progress -> GOAP/work graph
- Task Checklist -> work/run task state
- Human Approvals -> approval/policy queue
- Token & Cost -> telemetry/usage/receipts
- Runtime State -> runtime/terminal/machine authority
- Operational Metrics -> telemetry
- Artifact Preview -> artifact authority
- Recent Items -> recent work/projects/artifacts
- Command Launcher -> registered command/skill/tool authority
- Quick Controls -> explicit registered capabilities only

## Demo policy

Demo state is acceptable and preferred over invisible functionality during migration.

Requirements:

- clearly mark Demo/Local/Connected/Live;
- never represent demo values as live facts;
- preserve visual polish;
- replace adapters incrementally.

## Theme rule

Do not port a second independent theme state machine.

Adapt donor presets into canonical AgentSam semantic theme contracts.

All widgets must respond automatically when the host theme changes.

## Portability requirement

The widget package must not assume:

- Local Studio route paths;
- Cloudflare;
- a specific database;
- a particular MCP server;
- a particular model provider;
- desktop-only APIs.

Those capabilities are injected by adapters.

## Quality bar

Do not call migration complete simply because components compile.

Acceptance requires:

- matching or exceeding donor visual quality;
- keyboard usability;
- responsive layout;
- desktop interaction;
- theme switching;
- no obvious clipping/overflow;
- useful empty/loading/error/demo states;
- correct package exports;
- documented adapter contracts;
- screenshot/manual comparison against donor.

## Hosted/Desktop parity

Every migration batch must verify:

1. `@inneranimalmedia/agentsam-workbench` package tests/build
2. Local Studio hosted build
3. desktop Local Studio build
4. desktop-shell sync
5. desktop smoke
6. same widget behavior in both hosts

A hosted-only widget fix is incomplete.
