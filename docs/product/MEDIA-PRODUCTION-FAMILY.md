# Media Production family — portable editing + hosted media operations

**Family ID:** `media-production` · **Members:** `copro`, `movie-mode`
**Source-of-truth family registry:** `SamPrimeaux/inneranimalmedia/product-manifests/media-production.json`
**Status:** Classified in manifests; **cross-product runtime adapter is not yet delivered**.

## Who owns what

| Responsibility | Authority | Concrete roots |
| --- | --- | --- |
| Creative project document, provider-neutral asset references | CoPro | `packages/copro-project`, `packages/copro-media` |
| Editing commands, history, timeline math | CoPro | `packages/copro-editor`, `packages/copro-timeline` |
| Direct manipulation and mobile editing UI | CoPro | `packages/copro-ui`, `apps/agentsam-copro-studio` |
| Render intent, reusable generation/scene templates | CoPro | `packages/copro-render`, `packages/copro-templates` |
| Provider contracts / proof / portable persistence | CoPro | `packages/copro-provider-contracts`, `packages/copro-proof`, `packages/copro-storage` |
| Hosted MovieMode products/timelines, asset registry and artifact bytes | MovieMode | IAM main Worker `src/api/moviemode-api.js`; `moviemode_*` D1, `media_assets`, R2 and ARTIFACTS |
| Hosted generation, Remotion, transcode, Stream and export execution | MovieMode | IAM `src/core/moviemode-render-dispatch.js`, `src/core/cloudconvert-task-graph.js`, streaming/media APIs |
| Globe landing / legacy routes | MovieMode service (slim) | IAM `services/moviemode-service`; API copies are not active offload |
| Native processing, browser capture, approvals, evidence | Platform/runtime capabilities | AgentSam Hooks, authorized ExecOS/agentsamd, browser screenshot tools; not a new CoPro daemon |
| Public interactive scroll chapters | Site Studio / theme-scenes | `@inneranimalmedia/theme-scenes`; consumes CoPro/MovieMode produced media |

## Contract law

1. CoPro's canonical persisted `copro.project.v1` uses integer microseconds, `assetId` clip references and **no renderer identity, raw R2 references, hosted worker topology or credentials**.
2. MovieMode's existing `MovieModeTimeline` v1 uses frames and has renderer and storage fields; its D1/R2 records remain authoritative for currently hosted user data.
3. A family is **not** a common writable database. Do not create two competing canonical editors or run a silent schema migration.
4. Only after a compatibility adapter proves full round-trip, clip/asset ordering, timebase precision, effects, revisions, authorization, save/reload, and output parity should a writer-authority decision be made.
5. The accepted CoPro clean-room ADR forbids a required `copro-*` → MovieMode runtime dependency. Optional runtime provider adapters can target a MovieMode host through declared contracts.
6. Provider generation is opt-in/authorized; local processing, Remotion, CloudConvert and Stream must use appropriate capabilities without vendor defaults in portable projects.

## First integrated proof: robotics case-study clip

A seeded CAD/Franka chess session passes deterministic gameplay/simulation acceptance → authorized capture records real user-visible interaction → MovieMode registers source media and scope/provenance → CoPro editing commands compose trimmed shot(s) in a round-trip verified adapter → CoPro RenderPlan specifies output → existing MovieMode render/convert jobs produce verified loop and poster → CMS and theme-scenes present the media, labeled according to its test receipt.

This is a *proposed product integration*, not an already working end-to-end service.

## Completion gates

- Host project save and reload are durable (errors not swallowed); clip changes retain ordering, timing, and legacy fields.
- Workspace/tenant ownership controls for source objects and render-job status are tested negatively.
- Export reaches `done` only after validated persisted ingest; retries and failures remain observable.
- Local/remote/sandbox execution lane is explicitly authorized and does not silently hop across machines.
- Portable CoPro passes its own package tests and does not require hosted IAM services.
- Real browser/native media captures are clean and repeatable, not mislabeled as generated proof.
- CoPro + MovieMode provide a usable mobile-first preview/edit/export path before any claim of a combined product.

**Not in scope for family registration:** npm renaming, source moves, service deployments, new media tables, migration of production data, creation of a third editor, adding a new rendering Worker.
