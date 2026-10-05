# AgentSam Widget Platform — System Implementation Plan

Date: 2026-10-05
Status: Proposed implementation sequence
Depends on: ADR-0009, ADR-0010, PRD-agentsam-widget-platform

## Current audited state

The branch currently has:

- a real public `@inneranimalmedia/agentsam-workbench/widgets` package export;
- a portable Countdown widget and registry entry;
- donor widget/reference material quarantined outside production source;
- Local Studio Customize > Widgets integration;
- Local Studio widget visibility persisted in browser `localStorage`;
- four widget persistence tables already present in remote `inneranimalmedia-business` D1;
- one remote catalog row: `countdown`;
- zero remote installation/layout/preference rows;
- no runtime references to the four D1 tables outside migration SQL;
- Cloudflare Wrangler still reporting migrations 1345, 1346, and 1347 as pending;
- a staged donor-quarantine verifier with a recursion bug: Workbench `prepack` invokes the verifier, while the verifier itself calls `npm pack` on Workbench.

Do not merge the staged recursive verifier as-is.

## Target architecture

```text
domain packages
  queue-control / goap / work / analytics / repository / content / ...
        |
        | optional ./widgets contributions
        v
@inneranimalmedia/agentsam-contracts/widgets
        |
        v
@inneranimalmedia/agentsam-workbench/widgets
  registry + frames + renderers + WidgetHost + WidgetStage
        |
        +------------------------+
        |                        |
        v                        v
host adapters              persistence adapters
runtime/domain APIs        D1 / SQLite / custom / memory
        |                        |
        v                        v
live widget state          installations/layout/preferences
        \________________________/
                    |
                    v
           Local Studio / desktop
           SDK consumer applications
```

D1 stores catalog/user composition state only. It does not replace domain authorities.

## Phase 0 — Stabilize the branch

1. Rebase/merge the widget branch over current `main`.
2. Fix the donor quarantine recursion:
   - the prepack-safe verifier must never call `npm pack` for the package whose prepack invoked it;
   - split verification into:
     - `verify:widget-donor-source` — source/files allowlist checks safe inside prepack;
     - `verify:widget-package` — external tarball dry-run invoked from root CI only.
3. Preserve current staged work before rewriting it.
4. Run Workbench build/test/pack after the split.

Exit gate:

- no recursive process spawning;
- workbench pack dry-run succeeds once;
- donor files do not ship.

## Phase 1 — Expand the portable widget contracts

Extend `@inneranimalmedia/agentsam-contracts/widgets` with:

- `AgentSamWidgetSurface`;
- richer runtime/source states;
- package ownership metadata;
- stable adapter descriptors;
- configuration schema metadata;
- action definitions;
- contribution/module contract;
- persistence adapter contract;
- host capability context.

Keep contracts serializable where possible.

Suggested contribution shape:

```ts
interface AgentSamWidgetContribution {
  id: string;
  ownerPackage: string;
  version: string;
  title: string;
  description?: string;
  category: string;
  componentKey: string;
  sizes: readonly AgentSamWidgetSize[];
  surfaces: readonly AgentSamWidgetSurface[];
  requiredCapabilities?: readonly string[];
  dataAdapterKey?: string;
  actionAdapterKey?: string;
  configSchema?: Record<string, unknown>;
  sourceState?: 'live' | 'local' | 'connected' | 'demo' | 'development';
}
```

IDs are stable API. Renaming a widget id requires an explicit migration/alias.

## Phase 2 — Build registry composition

Replace a single hardcoded builtin-array mental model with a registry that can compose contributions.

Required APIs:

- `createWidgetRegistry()`;
- `registry.register(contribution)`;
- `registry.registerMany(contributions)`;
- `registry.get(id)`;
- `registry.list(filters)`;
- duplicate-id rejection;
- package/source metadata;
- capability/surface eligibility checks.

Workbench owns rendering/component resolution.

D1 catalog rows are reconciled from this known registry; D1 never supplies executable import paths.

## Phase 3 — Define package contribution conventions

A package may opt in by exporting `./widgets`.

Do not require every package to contribute widgets.

Initial candidate portfolio:

| Package / authority | Candidate widget ids | Notes |
| --- | --- | --- |
| Workbench | `countdown`, `clock`, `calculator`, `launcher` | Core utility widgets |
| `agentsam-queue-control` | `queue.depth`, `queue.status` | Queue authority only |
| `agentsam-goap` / `agentsam-work-graph` | `goap.progress`, `workgraph.progress` | Planning/execution projections |
| `agentsam-work` | `work.tasks`, `work.active` | Real work/task state |
| `agentsam-analytics` | `analytics.cost`, `analytics.runtime`, `analytics.usage` | Telemetry/usage projections |
| `agentsam-repository` | `repository.health`, `repository.churn`, `repository.index` | Repo intelligence and index state |
| `agentsam-knowledge` | `knowledge.index`, `knowledge.retrieval` | Knowledge/index health |
| approval/control-plane authority | `approvals.pending` | Uses existing approval queue |
| artifact authority | `artifacts.recent`, `artifacts.preview` | Metadata/preview, not duplicate storage |
| `agentsam-content` / media authority | `content.recent`, `media.preview` | Content/media projections |
| `agentsam-connector-cloudflare` | `cloudflare.runtime`, `cloudflare.observability` | Connected-account gated |
| `agentsam-brand` | `brand.health` | BrandContract projection |
| `agentsam-campaign` | `campaign.status` | Campaign projection |
| `agentsam-scoring` | `scoring.run` | Score family summary |
| `agentsam-database-editor` | `database.health` | Metadata/health only |
| `agentsam-key-manager` / Vault | `providers.connections` | Connection health only; never secrets |

The donor component names are UI references, not package-authority declarations.

## Phase 4 — Reconcile and activate persistence

### 4A. Reconcile migration tracking

Before writing production code against the widget tables:

1. snapshot/inspect current live schema;
2. compare all four live CREATE TABLE statements to migration 1347;
3. inspect pending migrations 1345-1347;
4. verify idempotence;
5. apply them through the normal Wrangler migration path;
6. confirm one Countdown catalog row and zero user-state rows remain intact.

### 4B. Add persistence service/API

Implement a host-neutral `WidgetPersistenceAdapter` and a Local Studio D1 implementation.

Minimum Local Studio API:

- `GET /api/widgets/bootstrap?surface=...`
- `GET /api/widgets/catalog`
- `POST /api/widgets/installations`
- `PATCH /api/widgets/installations/:id`
- `PUT /api/widgets/layouts/:installationId`
- `PUT /api/widgets/preferences/:installationId`
- `DELETE /api/widgets/installations/:id`

`bootstrap` should return catalog eligibility plus the signed-in user's installation/layout/preference state in one request.

Server derives account/user scope from authenticated session.

### 4C. Replace Local Studio localStorage authority

Move `apps/local-studio/frontend/src/lib/widgets/preferences.ts` behind the persistence adapter.

Rules:

- authenticated hosted Local Studio -> D1 adapter;
- signed-in desktop with sync -> D1 + local cache/queue;
- offline desktop -> local SQLite adapter;
- anonymous/simple browser consumer -> local adapter allowed;
- portable Workbench -> no D1 dependency.

Do not maintain independent preference schemas per host.

## Phase 5 — Runtime adapters and state discipline

Define a host `WidgetAdapterRegistry`.

Each data adapter:

- reads an existing domain authority;
- returns a typed widget state;
- declares refresh class;
- exposes no secret material;
- handles unsupported/disconnected/error states explicitly.

Each action adapter:

- delegates to the real package/service;
- uses existing permission/approval policy;
- returns receipts/errors through canonical AgentSam error contracts.

No widget performs writes by directly mutating another package's persistence.

## Phase 6 — Graduate donor UI into reusable primitives

Graduate donor work in layers:

1. Frame/card visual quality;
2. responsive small/medium/large layouts;
3. drag/snap/edit-mode gestures;
4. library/add-widget UX;
5. WidgetStage / side-stage;
6. generic metric/list/media/artifact visual primitives;
7. package-contributed real widgets.

Do not migrate donor-specific weather identity as core product authority.

Demo adapters may preserve useful visual work while real adapters are built, but Demo must be visibly labeled.

## Phase 7 — Host surfaces

### Customize > Widgets

This is the canonical management surface:

- discover package-contributed widgets;
- inspect package/source/capability state;
- install/uninstall or enable/disable;
- configure;
- choose default placement/size;
- preview.

### AgentSam WidgetStage

The lead conversation stays visible while a contextual stage can show:

- active run;
- workflow progress;
- task checklist;
- approvals;
- cost/usage;
- queue depth;
- runtime state;
- artifacts.

### Generic SDK host

Provide a portable `WidgetHost` API so third-party consumers can register:

- registry contributions;
- data/action adapters;
- persistence adapter;
- theme tokens;
- supported surfaces/capabilities.

No Local Studio route imports are allowed.

## Phase 8 — Desktop and sync

Use the same Workbench package code in hosted and desktop Local Studio.

Desktop persistence:

- local SQLite for offline-first state;
- optional D1 sync for authenticated users;
- never raw provider credentials in widget records.

Start with deterministic last-write-wins by row `updated_at` for widget composition state only. Domain data retains its own synchronization rules.

## Phase 9 — Verification and release

Required CI gates:

1. contract tests;
2. unique widget id test across all contributions;
3. registry composition tests;
4. package build;
5. tarball contents;
6. isolated consumer install/import;
7. Local Studio hosted build;
8. Local Studio desktop smoke;
9. persistence integration tests against temporary SQLite/D1-compatible schema;
10. D1 API auth/scope tests;
11. donor quarantine source check;
12. registry release check after npm publish.

For every package that exposes `./widgets`:

- the export must exist locally;
- the tarball must contain it;
- the exact registry version must expose it after release.

The root SDK version alone is never proof that a widget-contributing package shipped.

## V1 completion criteria

V1 is complete when:

- the registry composes contributions from at least five independent first-party package authorities;
- at least ten useful widgets are visible in the library;
- at least five use real live adapters;
- Demo/Needs Connection/Unsupported states are explicit;
- D1 installations/layout/preferences are used by hosted Local Studio;
- Local Studio no longer treats browser localStorage as signed-in widget authority;
- layout survives reload and another signed-in browser session;
- desktop works from the same widget package with local persistence;
- a standalone consumer fixture imports the package API without Local Studio source paths;
- package and registry release checks pass for the exact released versions.
