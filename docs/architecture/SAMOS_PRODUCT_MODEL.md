# SamOS — complete product before isolated operation

Status: **direction + scoped contract**, not a claim that all lifecycle operations have been implemented.

## Operating-system analogy

InnerAnimalMedia owns the platform; **SamOS** is the coherent installed environment; **AgentSam SDK** is the portable developer and runtime interface; apps/extension packages are experiences available within it. Existing ACP runs, IAM identity, host permissions, app and package manifests, existing registries and project stores retain their authority. SamOS composes them; it must not become a parallel database, orchestration engine or subscription trap.

A fresh user should be able to install the SDK, initialize an authorized workspace, discover installed and available functions, run a useful workflow with native capabilities, inspect outputs, save and reopen their work, and understand dependency/permission requirements. Optional providers extend capabilities; missing paid providers must not make basic installed workflows unusable.

## Operation vs product

- **Primitive operation:** `brand.scan` inspects existing evidence; `planning.goap` plans; `terminal.exec` executes authorized commands. Operations need not have CRUD if they do not own persistent resources.
- **Product journey:** Brand Studio should guide **create/import → scan → inspect → refine → preview → approve/reject → persist/version → publish/export → reopen/restore** using existing brand package and CMS/media authorities. A scanner alone is not a finished brand product.
- **Resource authority:** Persistent resources such as projects, brand packs, assets, artifacts and installations need their legitimate **create/list/get/update/delete/restore** lifecycle where appropriate. They remain owned by their canonical product/service.
- **Distribution:** A customer installs a useful product with coherent initial abilities. Specialized or optional integrations can be additional, but must be transparently disclosed and not hide core advertised functions.

## Existing baseline (verified 2026-10-17)

`src/sam/packs/core.js` registers **21 core operations**: 11 general and 10 robotics simulation. `AgentSamClient` already exposes `projects.list/get/create/edit/delete/restore`, SQLite CRUD projections, and single-purpose core operation projections, but these are not a fully integrated product journey. `packages/agentsam-brand` already documents brand pack ingest/derive/plan/promote/publish/verify; do not reimplement it to add user-facing steps. Capability manifest counts and registry declarations are **not** proof of host bindings or complete product readiness.

## Baseline installed experience

1. **Boot/initialize:** local workspace, readable configuration, environment health, supported host lanes, optional cloud sign-in; never require company-owned ExecOS for customer use.
2. **Home/workspace:** named projects, recent work, installed experiences, approvals, operation status and receipts.
3. **Product modules:** useful first-run journeys, sensible defaults, progressive detail and command/API parity where supported.
4. **Trusted execution:** distinguish declared, registered, bound, dependencies ready, authorized, tested and verified; request effect-specific approvals; preserve actor/tenant scopes.
5. **User-facing outputs:** searchable saved assets, versioned artifacts, previews and restore; real failure/recovery states.
6. **Updates/installations:** app/package manifest authority and hosted/local installation truth; no silently promised deployment.

## Initial product completeness matrix (target; NOT registered operation claims)

| Product | Resource lifecycle | User actions | Delivery proof |
| --- | --- | --- | --- |
| Workspace | project create/list/get/edit/delete/restore | initialize/open/import/configure | reopen and isolation tests |
| Brand | brand pack create/import/list/get/edit/version/restore | scan/derive/refine/preview/approve/publish/export | inspect real HTML preview + actual persisted/published artifact |
| Knowledge | indexed source list/get/remove/refresh | crawl/ingest/query/cite | freshness/ownership and retrieval receipts |
| Packages | package discover/install/list/update/remove | audit/verify/publish (authorized) | cold install + invocation check |
| CMS / commerce | existing product-specific CRUD authorities | author/preview/approve/publish | tenant-specific live URL + source SHA |
| CAD / media | assets/projects/version/restore | inspect/edit/validate/render/export | openable saved artifact and valid formats |
| Execution | run list/get/cancel under ACP | plan/approve/execute/verify | durable actor-scoped run receipts |

This table describes **experiences to close**, not license to add same-named CRUD operations, database tables, or new privileged services without source audit.

## Release condition for any user-visible surface

For a web interface, **mainline source + installed app entry + stable hosted URL + authorization + actual URL smoke + revision receipt** are required before marking shipped. Localhost or a built `dist` is preview-only. For desktop or headless products, require an installed application or documented reproducible SDK/CLI entry point and an invocation receipt. Link unresolved releases to issues, not lost feature branches.

Follow `docs/standards/DELIVERY_CLOSURE.md`. GitHub issue forms are intake, `.agentsam/templates/issue-delivery.v1.yml` is an advisory evidence crosswalk, and the existing GOAP/ACP/operation system remains the executor.
