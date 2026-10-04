# AgentSam Offer Portfolio

This document maps the current `agentsam-sdk` package/app surface into real-world product offers, product engines, shared primitives, adapters, and sellable presentation assets.

## Portfolio rule

A package is not automatically a product. Products are defined by end-to-end user value.

## Primary offers

| Offer | Current status | Primary implementation | Intended value |
| --- | --- | --- | --- |
| AgentSam Platform / SDK | Alpha | `@inneranimalmedia/agentsam-sdk` + shared primitives | Build portable AgentSam-powered products without rebuilding the machinery |
| AgentSam Local Studio | Alpha | `apps/agentsam-local-studio` | Local-first project, provider, terminal, work, and packaged-app workspace |
| AgentSam Work | Experimental | `agentsam-work`, `agentsam-work-graph` | Durable goals, work, approvals, evidence, artifacts, and progress |
| AgentSam Brand | Experimental | `agentsam-brand` | Durable brand intelligence and governance |
| AgentSam Campaign | Experimental | `agentsam-campaign` | Evidence-backed campaign decisions and learning |
| AgentSam Content Studio | Alpha | `agentsam-content`, `agentsam-content-studio` | Portable content/media lifecycle and preparation |
| AgentSam Database Studio | Alpha | `agentsam-database-editor` | Safe provider-neutral database inspection/editing |
| AgentSam Browser | Experimental | `agentsam-abs`, `agentsam-browser-surface` | Browse/Build web exploration and generation |
| AgentSam Analytics | Experimental | `agentsam-analytics`, `analytics-ui` | Commerce + AgentSam operational decision support |
| AgentSam Knowledge | Experimental | `agentsam-knowledge`, `agentsam-repository` | Provenance-aware reusable project/organization knowledge |
| AgentSam Merch | Experimental | `agentsam-merch` | Manufacturing-ready artwork/product preparation |
| AgentSam CAD Studio | Experimental | `apps/agentsam-cad-creator` | Agent-assisted structured spatial/CAD design |
| AgentSam Commerce Studio | Experimental | `apps/ecommerce-cms-agentsam` | Provider-neutral commerce operations with AgentSam assistance |
| AgentSam Site Studio | Experimental | CMS runtime + sections + themes | Brand-aware website creation/refinement |
| AgentSam Developer Studio | Experimental | `agentsam-ide` + workbench | Reusable AgentSam-native developer workspace |
| AgentSam Hosted Runtime | Experimental | `apps/agentsam-go-worker` | Durable hosted orchestration without idle model polling |

## Shared primitives - not standalone offers by default

- `agentsam-contracts` - framework-neutral contracts.
- `agentsam-errors` - error normalization/remediation.
- `agentsam-hooks` - lifecycle hooks/adapters.
- `agentsam-goap` - planning/control-plane contracts.
- `agentsam-queue-control` - queue/retry/scheduling machinery.
- `agentsam-scoring` - reusable scoring contracts.
- `agentsam-vault` - secret storage contracts.
- `agentsam-workbench` - reusable agent interaction primitives.
- `agentsam-work-graph` - durable graph primitive.
- `agentsam-settings` - settings surfaces.
- `agentsam-shell-kit` - shell composition.
- `agentsam-nav` - responsive navigation.
- `agentsam-assets-core` - canonical asset identity/provenance.
- `agentsam-loading-scene` - runtime visualization.
- `agentsam-key-manager` - keys/integrations UI.
- `agentsam-desktop-shell` - packaging/runtime shell.
- `agentsam-docs-theme` - documentation presentation.

## Adapters / providers

- `agentsam-cloudflare-images` - image transport adapter.
- `agentsam-provider-completeful` - fulfillment/manufacturing provider adapter.
- `agentsam-connector-cloudflare` - Cloudflare connector.
- `identity` / `agentsam-identity` - identity implementation surfaces; identity remains a platform capability, not a forced company gate.

## Themes / prebuild assets

The theme packages are productized design assets for Site Studio and client deployments, not separate domain authorities:

- Cypress
- Ember
- Forge
- Grove
- Harbor
- Heuristic
- IASF
- Resolve
- Scenes
- Summit
- Violet

These may be sold or bundled as templates/prebuilds, but their durable product value comes from the Site Studio/theme ecosystem rather than pretending each theme is a software platform.

## Existing apps and placement

- `agentsam-local-studio` -> AgentSam Local Studio.
- `agentsam-work-app` -> AgentSam Work reference/packaged app.
- `agentsam-browser-site` -> AgentSam Browser public product/promo surface.
- `agentsam-go-worker` -> AgentSam Hosted Runtime.
- `agentsam-cad-creator` -> AgentSam CAD Studio.
- `ecommerce-cms-agentsam` -> AgentSam Commerce Studio.
- `client-cms-editor` -> donor/reference implementation for Site Studio; it should not remain the long-term product identity if stronger portable theme/content surfaces replace it.

## Productization priorities

### Tier 1 - closest to real external offers

1. AgentSam Local Studio
2. AgentSam Brand
3. AgentSam Campaign
4. AgentSam Content Studio
5. AgentSam Database Studio
6. AgentSam Browser

### Tier 2 - strong strategic offers requiring workflow closure

1. AgentSam Work
2. AgentSam Commerce Studio
3. AgentSam Merch
4. AgentSam Analytics
5. AgentSam Knowledge
6. AgentSam Hosted Runtime

### Tier 3 - promising specialized offers

1. AgentSam CAD Studio
2. AgentSam Site Studio
3. AgentSam Developer Studio as a standalone offer, if user demand justifies separating it from Local Studio

## Required next documentation

Each Tier 1 offer should eventually also have:

- use-case inventory;
- user journey;
- acceptance/eval suite;
- packaging/pricing hypothesis;
- security/privacy notes;
- launch checklist;
- telemetry/success metrics;
- host/plugin distribution plan where applicable.

## Commercial packaging hypotheses

These are hypotheses to test, not locked pricing decisions.

| Offer | Free / adoption wedge | Paid value hypothesis |
| --- | --- | --- |
| AgentSam Platform / SDK | Public npm packages, docs, examples | Commercial support, managed services, enterprise distribution/controls |
| AgentSam Local Studio | Useful local desktop core with user-owned providers | Pro/team workspace, managed sync, remote runtimes, collaboration, premium packaged capabilities |
| AgentSam Work | Personal/local work graph and basic planning | Team coordination, durable automation, approvals, managed runs, reporting |
| AgentSam Brand | Basic brand inspection and local BrandContract | Connected brand intelligence, team governance, asset audits, monitoring, advanced workflows |
| AgentSam Campaign | Basic planning/evaluation with supplied context | Connected commerce/analytics/search evidence, learning loop, team workflows, premium execution/measurement |
| AgentSam Content Studio | Local/R2-first library and inspection | Team asset workflows, advanced preparation, usage intelligence, managed delivery/storage |
| AgentSam Database Studio | Local database inspection/editor | Team/production connections, approvals, audit history, managed remote access |
| AgentSam Browser | Explore/Build local experience | Hosted generation, managed sandboxes, premium models/runtimes, team/browser workspaces |
| AgentSam Analytics | Local/read-model analytics | Connected multi-source analytics, scheduled briefs, team reporting, longer retention |
| AgentSam Knowledge | Local indexing/retrieval | Managed indexes, shared organizational knowledge, scheduled refresh, larger-scale retrieval |
| AgentSam Merch | Local preflight/planning | Provider integrations, production workflows, collection operations, premium preparation/export |
| AgentSam CAD Studio | Local structured design workspace | Advanced exporters, simulation/fabrication integrations, team/project workflows |
| AgentSam Commerce Studio | Self-hostable core/admin | Managed commerce operations, provider integrations, premium automation/analytics |
| AgentSam Site Studio | Open/prebuilt themes and portable site runtime | Premium prebuilds, managed hosting/deploy, assisted refinement, agency/client workflows |
| AgentSam Developer Studio | SDK/Local Studio developer surface | Team/project features, managed environments, premium remote runtimes if separately validated |
| AgentSam Hosted Runtime | Self-hostable runtime protocol/service | Managed execution capacity, observability, scheduling, durable queues, enterprise controls |

## Offer validation questions

Before investing heavily in any paid tier, answer:

1. What recurring problem is painful enough that users return without being reminded?
2. What data/context makes AgentSam materially better than a generic model response?
3. Which part can remain local/free and which part creates genuine managed-service value?
4. What ongoing infrastructure cost justifies usage-based or subscription pricing?
5. Does the offer save time, reduce risk, increase output quality, increase revenue opportunity, or enable work the user otherwise cannot do?
6. Can the value be demonstrated in under five minutes to a new user?
7. Can the product survive changing model/provider vendors without losing its identity?
8. What measurable event proves the core job was completed successfully?
