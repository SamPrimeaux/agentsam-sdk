# Forms, Storefront Embeds, and Marketplace Product Lifecycle

**Status:** Target architecture and acceptance specification
**Initiative branch:** `feat/marketplace-forms-end-state-20261125`
**Companion specification:** [`inneranimalmedia-app-store/docs/marketplace-product-experience-end-state.md`](https://github.com/SamPrimeaux/inneranimalmedia-app-store/blob/feat/marketplace-forms-end-state-20261125/docs/marketplace-product-experience-end-state.md)
**Last reviewed:** 2026-11-25

This document defines the end deliverable across AgentSam's portable SDK, CMS, merchant authoring applications, storefront runtime, product catalog, and analytics. It is a target contract, not a claim that the work is already implemented or deployed. Proposed operation names below are design targets until backed by implementation and tests.

## 1. Outcome

A merchant must be able to create a form or storefront extension once, edit it through the appropriate existing surfaces, publish it, place it on a real storefront, receive and manage submissions, distribute it as a product when applicable, and measure its performance. The complete flow must work through both the UI and AgentSam's supported APIs.

The system must use one canonical resource lifecycle and the existing product, CMS, installation, communications, and analytics infrastructure. It must not introduce a parallel CMS, embed database, form registry, installation registry, or analytics pipeline.

The end-to-end lifecycle is:

`Define → Create draft → Configure → Preview → Revise → Publish → List/distribute → Install/place → Render → Submit/execute → Measure → Manage`

## 2. Repository and package ownership

| System | Canonical responsibility | Must not own |
|---|---|---|
| `packages/agentsam-contracts` | Portable document, event, and resource contracts | SQL, host authentication, persistence |
| `packages/agentsam-embeds` | Storefront embed definitions, stable keys, configuration schemas, capabilities, permissions, surfaces, validation | CMS persistence, product listings, merchant authorization, submission storage |
| `packages/agentsam-cms` | Portable CMS operations for site-owned resources, drafts, revisions, publication and restore contracts | Direct D1 binding, provider secrets, storefront-specific UI |
| `apps/ecommerce-cms-agentsam` | Trusted CMS host adapter, merchant authorization, site-scoped repositories, CMS editor and storefront integration | A second product catalog or competing resource lifecycle |
| Forms app/module | Form management, form-specific authoring and response inbox | Independent form storage or independent publication authority |
| Growth app/module | Campaigns, signup flows, attribution and conversion workflows | Form document persistence or email transport |
| Product Studio | Product creation, metadata, pricing, packaging, versioning and listing lifecycle | Embed definition registry or CMS page authoring |
| Design Canvas | Shared visual authoring and preview surfaces | Separate form schema, document database or publication service |
| `agentsam-communications` | Provider-neutral message delivery and delivery results | Form definitions or marketing campaign ownership |
| Resend integration | One authorized email transport provider | Storefront UI or embed ownership |
| `agentsam-analytics` and host writer | Normalized operational and behavioral events/read models | Raw form answer storage or a competing activity log |
| `agentsam_app_installations` and existing install services | Account-owned application installation state | A new embed-specific installation registry |

The Ecommerce CMS is the trusted host for merchant/site mutations. Portable packages receive a host repository and trusted context; they do not connect directly to a tenant database.

## 3. Current baseline and known gaps (2026-11-25 audit)

The following observations were made while tracing the local SDK checkout and the existing InnerAnimalMedia D1 database. They are baseline facts, not assertions about every deployed environment:

- The public route `/forms/embed/:id` resolves a real CMS-backed form. Its source record is a `cms_globals` row with `global_type='form'` and the stable site-owned global key `form:contact-inquiry`.
- Five site-scoped form globals already exist: contact/project inquiry, custom merchandise request, launch/early-access waitlist, newsletter signup, and website project brief. The existing records include draft/published state and structured document JSON.
- `cms_form_submissions` already exists and carries form, account/site, and test/live ownership information. The audit did not establish a successful live production submission; passing isolated tests are not a substitute for a production end-to-end proof.
- `apps/local-studio/backend/worker/agentsam-forms.js` already implements form administration, public rendering/submission and owner response access. Its existing tests cover install, seeding, draft edit, optimistic versioning, publish, public submit, owner inbox, unpublish and fail-closed ownership cases.
- The Forms app manifest currently declares installation unsupported, despite existing app-installation authority and CMS-backed behavior. App availability and installability must be reconciled with the canonical `agentsam_app_installations` flow; do not invent a second installation path.
- `packages/agentsam-cms` has page/component/theme/navigation/asset operations but no general merchant-facing globals CRUD contract yet.
- `packages/agentsam-embeds` and the Forms app currently have different document/configuration and submission expectations. The base SDK checkout and the separate marketplace worktree also had different embed catalog counts at audit time (four versus ten). Reconcile one reviewed canonical manifest; do not preserve two catalogs.
- The embed package's `validateEmbed` is definition/configuration validation, not authorization or persistence. Its `listEmbeds` and `getEmbed` are catalog operations.
- Existing `products` records include `app_embed` products. Product creation and listing lifecycle need to support this kind without creating irrelevant physical inventory variants.
- `emitAnalyticsFact()` already writes normalized facts to `agentsam_analytics` and attempts projection to `AGENTSAM_ACTIVITY`. Reuse it; do not add a second event pipeline.

## 4. Canonical form document and embed model

### 4.1 Form document

Define the portable form document contract in `packages/agentsam-contracts`. The document is stored as a site-owned CMS global (`cms_globals.global_type='form'`) and versioned through the existing CMS revision/publication lifecycle.

The contract must cover:

- Stable form identity and schema version.
- Name, description and merchant-facing metadata.
- Ordered fields with stable field IDs, field types, labels, help text, placeholders, defaults and required state.
- Field validation, constraints, conditional visibility and accessible error messages.
- Consent declarations with purpose, displayed wording/version and required/optional status.
- Presentation tokens and layout options, inheriting the site design system unless explicitly overridden.
- Responsive behavior and accessible labels/focus/error states.
- Submission destination/intent, success state, failure state and retry behavior.
- Spam/rate-limit policy references and retention classification (policy configuration, not executable client code).
- Attribution context that can be safely associated with a submission without placing personal answers in analytics.

Do not create a new `forms` or `form_documents` table. Existing `cms_globals`, `cms_revisions`, `cms_publications` and `cms_form_submissions` remain the persistence foundation, subject to schema verification and narrowly scoped migrations when required.

### 4.2 Embed definition versus embed instance

An embed definition describes a reusable capability. An embed instance/configuration describes how that capability is placed or presented on a particular site/page. A form document is the content/resource that an instance may reference.

- `form_inline` and `form_popup` are presentation/placement choices, not separate form stores.
- Multiple placements may reference the same published form resource.
- A form may be previewed in Forms or Design Canvas without being installed on a page.
- Removing a placement must not delete the referenced form document or its submissions.
- Deleting/archiving a form must check references and preserve the defined retention/audit behavior.

### 4.3 `agentsam-embeds` API boundary

Keep the package portable and deterministic:

- `listEmbeds()` — list canonical definitions.
- `getEmbed(key)` — resolve a definition by stable key.
- `validateEmbed(definitionOrKey, config)` — validate the definition/configuration against the contract and return actionable issues.
- `createEmbedConfig(key, overrides)` — optional pure factory for validated default configuration; it must not persist data.

Do not add a persistence-oriented `createEmbed()` to this package. Persist a CMS resource through the CMS host; place it through CMS component/page operations. If a later API uses the name `createEmbed`, it must be an explicitly documented host/CMS operation, not a second persistence owner hidden inside the catalog package.

The catalog manifest is the single source of truth for stable keys, defaults, editor fields, supported surfaces, capabilities, permissions, runtime requirements and compatibility. Generated Theme Studio catalogs must be reproducible from this manifest and tested for drift.

## 5. Canonical CMS globals operations

Extend `packages/agentsam-cms` with portable operations for site-owned global resources. These names are proposed operation IDs and must be finalized against the existing operation contract conventions before implementation:

| Target operation | Required behavior |
|---|---|
| `cms.globals.list` | List authorized resources for the trusted account/site and optional type/status filters |
| `cms.globals.read` | Read one resource with ownership and visibility checks |
| `cms.globals.createDraft` | Create a draft resource with server-derived account/site/actor scope |
| `cms.globals.updateDraft` | Update only a draft, using expected version/revision for optimistic concurrency |
| `cms.globals.history` | Return ordered revisions and publication metadata |
| `cms.globals.restore` | Restore a prior revision as a new draft/revision; never rewrite history |
| `cms.globals.publish` | Publish an authorized validated revision through the existing trusted publication authority |
| `cms.globals.unpublish` | Remove public availability without deleting the resource or history |

The SDK package defines operations and delegates effects to an injected host repository. The Ecommerce CMS implements the repository with the existing `cms_globals`, `cms_revisions`, and `cms_publications` ownership model. The host must derive account, site and actor from verified session context; client payload scope is never authoritative.

Required behavior:

- Site/account isolation on every read and write.
- Explicit draft/published/archived lifecycle and immutable revision history.
- Optimistic concurrency and useful conflict responses.
- Idempotency for retryable create/publish actions.
- Validation before publication.
- Durable publication proof before reporting success.
- Fail-closed behavior when host context, permissions, repository methods or publication proof are missing.
- Activity audit for authoring and publication actions.

The existing Forms HTTP routes remain compatibility adapters while clients migrate. They must call the same CMS service/repository and may not keep independent SQL mutation logic.

## 6. Form authoring and public runtime

### 6.1 Merchant management

Keep `/admin/forms` as the Forms management entry point. It is a merchant-facing feature within the existing Ecommerce CMS application/installation model, not an unrelated app with its own persistence.

The management experience must provide:

- Site-aware form library with search and draft/published/archived filters.
- Create from an approved template or blank document.
- Edit, duplicate, preview, publish, unpublish and revision history.
- A real submission inbox with test/live distinction, safe detail access, filtering and export/retention controls.
- Clear submission counts and form status from persisted data.
- Open-in-Design-Canvas using the same form resource ID and revision context.
- Growth campaign association without duplicating the form document.

Templates must be sourced from the existing central studio template/catalog infrastructure (or an approved canonical CMS template source), not a hardcoded `FORM_STARTERS` registry or customer-specific fixture data. Existing merchant drafts must be preserved during migration.

### 6.2 Shared rendering and submission contract

The public route `/forms/embed/:id` remains supported for existing links and iframe integrations. CMS page components and storefront embed renderers must use the same document resolver, renderer and submission service.

The canonical submit transport is a versioned JSON contract that returns a stable receipt and status. The iframe route may retain an HTML-compatible wrapper for legacy clients, but it must delegate to the same submission service. Do not maintain one HTML-only response contract in Forms and a separate JSON-only submission implementation in the embed widget.

Submission lifecycle:

1. Resolve the currently published form and verify public visibility.
2. Apply server-side field validation, consent requirements and abuse controls.
3. Derive form/account/site ownership from the stored form, not client-supplied identifiers.
4. Persist a submission to `cms_form_submissions` with idempotency protection.
5. Return a durable receipt and user-safe success response.
6. Emit normalized analytics and optional downstream events only after persistence succeeds.
7. Route the response to the authorized merchant inbox.

Security and privacy requirements:

- Never trust client-supplied account/site/form ownership.
- Never allow a draft or unpublished form to accept public submissions.
- Apply rate limits, bot/spam controls, payload size limits and safe error responses.
- Keep raw answers, email addresses, phone numbers and consent text out of analytics dimensions and logs.
- Store consent evidence (purpose, wording/version, timestamp and relevant source context) with the submission or its associated consent record.
- Preserve entered values after recoverable failures without exposing them to unrelated sessions.
- Enforce retention, deletion, export and access policies at the host boundary.
- Test CSRF/origin behavior appropriate to iframe, same-site and cross-site embed contexts.

## 7. Product Studio and distribution lifecycle

`products` remains the canonical commercial catalog for installable apps, embeds, themes and other distributable products. `agentsam-embeds` is not a product registry.

Product Studio must support `app_embed` as a first-class product kind and must not create physical variants/inventory for non-physical products. The product lifecycle must persist the relevant existing product fields, including product kind, catalog kind, lifecycle status, catalog visibility, package name, version, canonical path, digital reference and metadata. Confirm the deployed schema and existing product API before proposing migrations.

For an embed product:

- The product listing references a stable embed definition key and a compatible package/version.
- The CMS installation references the canonical definition and site-owned configuration/resource.
- Version/compatibility checks happen before install/update.
- Merchant installation and page placement use existing installation and CMS component authority.
- Product listing, product version and merchant installation are distinct records with explicit links.

Do not create a physical stock variant for a form, popup or other software-only embed. Do not duplicate an embed definition in the product row; reference it and retain only commercial/distribution metadata there.

## 8. Shared authoring surfaces

All surfaces edit the same canonical resource and revision:

| Surface | Role |
|---|---|
| Forms | Form structure, behavior, validation, response management and publication |
| Growth | Campaign association, acquisition, signup journey and attribution |
| Product Studio | Commercial listing, packaging, version, visibility and distribution |
| Design Canvas | Visual layout, responsive preview, typography and appearance |
| CMS Page Editor/Theme Studio | Placement, page composition and storefront installation |
| AgentSam | Orchestrates the same authorized CMS/product operations through existing APIs |

No surface may fork the document schema, create its own form database, publish independently, or use a stale local copy as the source of truth. Cross-surface editing must preserve revision conflicts and clearly indicate when a newer version exists.

## 9. Analytics and operational events

Reuse `emitAnalyticsFact()` and the existing `agentsam_analytics` → `AGENTSAM_ACTIVITY` projection. Use `cms_activity_log` for auditable merchant actions. These systems are complementary, not interchangeable.

Recommended normalized events include:

- Authoring: `form_created`, `form_draft_saved`, `form_published`, `form_unpublished`, `form_revision_restored`.
- Distribution: `embed_product_created`, `embed_product_published`, `embed_install_started`, `embed_install_succeeded`, `embed_install_failed`, `embed_removed`.
- Storefront behavior: `embed_impression`, `form_opened`, `form_started`, `form_validation_failed`, `form_submitted`, `form_completed`, `form_dismissed`.
- Growth: campaign association and attributable conversion events using stable non-PII IDs.

Every event must carry the standard schema, event ID, occurrence time, domain, operation, outcome, actor/source and trace context where available. Use account/site/product/form/campaign IDs only where appropriate and authorized. Never place raw form answers or direct identifiers in dimensions/metrics. Submission persistence is authoritative for responses; analytics is authoritative for aggregate behavior and operational measurement.

Optional notifications and confirmations flow through `agentsam-communications`. Resend is a provider selected by the trusted host from an authorized account connection. Forms and embeds do not call Resend directly or store provider credentials.

## 10. Required acceptance scenarios

The initiative is not complete until these scenarios pass in a deployed test environment with a real test form and explicit test submissions:

1. Create a form through Forms using the canonical CMS globals operation.
2. Save, reload and edit the same resource; verify optimistic concurrency.
3. Create revisions, inspect history and restore an earlier revision as a new draft.
4. Preview the exact draft without making it publicly available.
5. Publish and verify durable publication proof and public visibility.
6. Render the same form through `/forms/embed/:id` and through a CMS page embed.
7. Submit from each surface and verify one durable, idempotent response record and a receipt.
8. Confirm the authorized merchant sees the response; another account/site cannot read it.
9. Confirm drafts/unpublished forms, forged scope, invalid consent, replayed requests and abusive rates fail safely.
10. Edit the form in Design Canvas and Growth without creating another document or losing revisions.
11. Create and publish an `app_embed` product without physical inventory scaffolding.
12. Install the product into a selected site through the existing installation authority and place it through CMS component operations.
13. Verify the installed storefront renderer resolves the correct published form and configuration.
14. Verify authoring audit events, submission events and analytics projection; confirm no raw answers/PII leak into analytics.
15. Verify optional confirmation/notification delivery through Communications and an authorized provider connection.
16. Verify all compatibility routes and existing merchant drafts remain intact during rollout.

Unit tests and mocked repository tests are necessary but insufficient. Add host integration tests, public runtime tests, account/site isolation tests, and a production-like browser journey. A green test suite alone does not prove the live Worker is deployed or the production database is wired correctly.

## 11. Delivery sequence

### Phase 1 — Contracts and ownership

- Reconcile the embed catalog to one canonical manifest and generated consumer catalog.
- Define portable FormDocument and submission/event contracts in `agentsam-contracts`.
- Add CMS globals operations and injected host repository methods.
- Add host implementation against existing CMS tables and authorization.
- Preserve legacy Forms routes as adapters.

### Phase 2 — One functional Forms lifecycle

- Connect `/admin/forms` to CMS globals operations.
- Connect the public renderer and JSON submission contract to the same service.
- Prove persistence, inbox, privacy, revision and publication behavior end to end.
- Move starter templates to the central template source.

### Phase 3 — Embed and product distribution

- Unify `form_inline`/`form_popup` with reusable form resources.
- Complete `app_embed` product creation and publishing in Product Studio.
- Connect installation and CMS page placement to existing authorities.
- Verify the installed storefront runtime independently of editor preview.

### Phase 4 — Cross-surface authoring and measurement

- Connect Growth and Design Canvas to the same resource/revision.
- Instrument authoring, install and storefront behavior.
- Add communications workflows and reporting.
- Validate app-store listing/detail/install journeys against the companion specification.

## 12. Explicit non-goals and prohibitions

- No second CMS, forms database, embed registry, product catalog, install registry or analytics pipeline.
- No persistence logic inside `agentsam-embeds`.
- No product-specific form schema or Resend-owned form UI.
- No customer-specific baked-in starter content or fixture labels in production UI.
- No public submission endpoint that accepts trusted account/site scope from the browser.
- No raw form data in analytics.
- No replacement of existing merchant drafts with starter content.
- No claim of production readiness based only on unit tests, a successful HTML render, or a local preview.

## 13. Definition of done

A merchant can create, edit, publish, install, render and measure a real form/storefront extension from the existing AgentSam ecosystem; a visitor can submit it; the correct merchant can manage the response; all surfaces refer to the same resource and revision; product distribution uses the canonical catalog and installation authority; and the complete journey is covered by security, integration and browser acceptance tests.
