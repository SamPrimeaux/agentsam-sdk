# ADR-0010: Widget Contributions, Registry Composition, and Persistence Authority

Status: Proposed
Date: 2026-10-05
Related: ADR-0009 AgentSam Widget Platform Authority

## Context

ADR-0009 establishes `@inneranimalmedia/agentsam-workbench/widgets` as the canonical portable widget UI/runtime surface and keeps real domain facts in their existing package/runtime authorities.

The current implementation is only partially connected:

- `@inneranimalmedia/agentsam-contracts/widgets` defines a small serializable widget contract;
- `@inneranimalmedia/agentsam-workbench/widgets` exports the portable runtime surface;
- the production registry currently contains one packaged widget, `countdown`;
- Local Studio's Customize > Widgets surface reads the Workbench registry but persists visibility in browser `localStorage`;
- D1 contains `agentsam_widget_catalog`, `agentsam_widget_installations`, `agentsam_widget_layouts`, and `agentsam_widget_preferences`;
- those four D1 tables have no runtime call sites outside their migration;
- the remote catalog currently contains one `countdown` row and the three user-state tables are empty;
- Wrangler still reports migration `1347_agentsam_widget_persistence.sql` as pending even though the four tables already exist remotely.

The platform also needs a clean way for first-party packages such as queue control, GOAP/work graph, analytics, repository, content/media, Brand, Campaign, and other domain packages to contribute relevant widgets without each package inventing a separate widget framework.

## Decision

### 1. Contracts are protocol authority

`@inneranimalmedia/agentsam-contracts/widgets` owns the portable, serializable widget protocol.

It defines:

- widget identity;
- package ownership metadata;
- category and semantic kind;
- supported sizes and surfaces;
- required capabilities;
- data and action adapter keys;
- configuration schema;
- runtime/source states;
- host/persistence adapter contracts.

The contract package does not render React UI and does not depend on Local Studio.

### 2. Workbench is render/runtime authority

`@inneranimalmedia/agentsam-workbench/widgets` owns:

- WidgetFrame and gesture/layout primitives;
- the canonical registry implementation;
- generic widget renderers;
- WidgetHost / WidgetStage composition;
- library/configuration UI primitives;
- semantic widget styling;
- portable consumer APIs.

Workbench must not become the authority for queue state, run state, telemetry, approvals, repository facts, content, or other domain data.

### 3. Domain packages may contribute widgets, but do not fork the platform

A first-party domain package may optionally expose a `./widgets` contribution surface when it has useful facts/actions to project.

A contribution is optional. A package is not required to have a widget merely because it is public.

A contribution must declare stable, globally unique widget ids. First-party ids use a namespaced form such as:

- `queue.depth`
- `queue.status`
- `work.tasks`
- `goap.progress`
- `analytics.cost`
- `repository.health`
- `knowledge.index`
- `brand.health`
- `campaign.status`

Core utility ids such as `countdown` and `clock` are reserved by Workbench.

Domain packages contribute one or both of:

1. serializable widget definitions and adapter descriptors; and
2. an optional custom widget module built on Workbench widget primitives.

Domain packages must not create their own WidgetFrame, registry, layout engine, theme persistence, or host routing.

### 4. Host composition is explicit and static

A host composes a registry from known installed package contributions.

Conceptually:

```ts
const registry = createWidgetRegistry({
  core: workbenchWidgets,
  contributions: [
    queueControlWidgets,
    workWidgets,
    analyticsWidgets,
    repositoryWidgets,
  ],
});
```

The host may conditionally include contributions based on installed packages/capabilities.

D1 is not a JavaScript module loader. A D1 row may identify a known package/component/adapter key, but it must never cause an arbitrary package name, file path, URL, or code payload to be dynamically imported.

### 5. Package metadata is the code identity source; D1 catalog is a projection

The compiled package registry/manifests are the authority for what widget code exists.

`agentsam_widget_catalog` is a server-side projection used for:

- discovery;
- enable/disable policy;
- package/component metadata;
- adapter/capability metadata;
- searchable catalog presentation;
- catalog version/hash reconciliation.

Catalog synchronization is idempotent. Deploy/startup tooling reconciles known package widget definitions into D1; D1 does not invent widget definitions that the host cannot resolve.

A future catalog migration may add:

- `supported_surfaces_json`;
- `source_state`;
- `definition_hash`;
- `catalog_source`.

These fields are added only after migration 1347 tracking is reconciled.

### 6. D1 stores user widget state, not domain runtime truth

The existing tables keep their intended responsibilities:

- `agentsam_widget_catalog` -> catalog projection;
- `agentsam_widget_installations` -> a user's configured widget instances per surface;
- `agentsam_widget_layouts` -> size/order/position/dock/collapse state per surface and breakpoint;
- `agentsam_widget_preferences` -> validated per-instance configuration/preferences.

They must not store:

- queue depth;
- run progress;
- approval state;
- telemetry samples;
- usage/cost truth;
- repository truth;
- provider secrets;
- artifact contents;
- domain business records.

Those facts remain in their current authorities and are projected through adapters.

### 7. Persistence is host-adapted and portable

Workbench defines a `WidgetPersistenceAdapter` contract.

Local Studio provides a D1-backed implementation for authenticated hosted use.

Packaged desktop provides a local SQLite implementation and may synchronize with D1 when the user is signed in.

A third-party SDK consumer may provide:

- its own database adapter;
- browser/local persistence;
- an in-memory adapter;
- no persistence.

Workbench must not require D1 to render widgets.

Local Studio's current `localStorage` visibility map becomes a compatibility/cache adapter only. It is not the canonical authenticated user-state authority.

### 8. Runtime data and actions are adapter-driven

A widget definition references stable adapter keys rather than importing backend state directly.

A data adapter resolves a widget state from an existing domain authority.

An action adapter delegates mutations/actions to an existing domain authority and must pass through the host's normal permission/approval policy.

The widget runtime must support at least:

- `loading`;
- `ready`;
- `empty`;
- `stale`;
- `needs_connection`;
- `unsupported`;
- `demo`;
- `error`.

Demo state is permitted only when visibly labeled and never masquerades as live data.

### 9. Surfaces are capabilities, not routes

Portable widget definitions declare supported semantic surfaces.

Initial canonical surface ids:

- `home`;
- `agentsam_stage`;
- `settings_preview`;
- `dock`;
- `embedded`.

Local Studio routes may host these surfaces, but route paths are not part of the portable widget contract.

### 10. Security and trust rules

- package/widget ids are allowlisted by the compiled registry;
- D1 cannot select arbitrary executable code;
- configuration is validated against the contribution's schema before persistence;
- account/user scope is derived from authenticated host context, not trusted client input;
- secrets remain in Vault/Keychain/provider authorities and never enter widget preference JSON;
- widget actions use existing approval/policy/permission machinery;
- unsupported capabilities resolve to an explicit state instead of a silent fallback.

## Migration reconciliation

Before wiring production writes:

1. compare the live four-table schema with `1347_agentsam_widget_persistence.sql`;
2. inspect Cloudflare's migration tracking state for 1345-1347;
3. verify all pending migrations are idempotent against the existing remote schema;
4. apply/record the migrations through the normal deployment path;
5. verify the `countdown` seed is unchanged and no user-state rows are lost;
6. only then add a follow-up migration for catalog fields required by this ADR.

Do not create a second set of widget persistence tables.

## Consequences

Positive:

- packages can expose useful widgets without creating package-specific dashboard systems;
- Workbench remains the reusable UI/runtime;
- Local Studio gains real cross-device persistence instead of route-local state;
- D1 becomes useful without becoming a runtime data warehouse;
- desktop and third-party SDK consumers can use different persistence adapters;
- package release verification can prove contributions are actually shipped.

Tradeoffs:

- hosts must explicitly compose installed package contributions;
- package authors must maintain stable widget ids and adapters;
- persistence/API work is required before Local Studio can replace its current localStorage shim;
- the migration tracking mismatch must be reconciled before further production schema changes.

## Rejected alternatives

### A standalone `@inneranimalmedia/agentsam-widgets` framework package

Rejected for v1 because Workbench already has the public `./widgets` surface and portable host primitives. A new framework package would duplicate authority.

### D1 as dynamic widget/module registry

Rejected because database metadata must not decide what executable package/code is loaded.

### Each domain package owning its own widget runtime

Rejected because it fragments layout, themes, interaction, persistence, and host behavior.

### Local Studio as widget authority

Rejected because AgentSam packages and third-party SDK consumers must be able to reuse the same widget system outside Local Studio.
