# InnerAnimalMedia Ecommerce CMS — Agent Authoring Rules

## Reference-fidelity implementation (mandatory)

When this app has a committed UI reference or a user-provided reference screenshot, treat it as an **implementation contract**, not inspiration. Reproduce the reference's interaction/layout model and information hierarchy closely while substituting installation-scoped Ecommerce/AgentSam data, ownership, branding, and theme tokens. "Polish" never authorizes arbitrary redesign.

Do **not** collapse or relocate panels, swap compact menu rows for oversized cards, hide controls shown in the reference, invent substitute icons, change established picker or modal workflows, or reinterpret placement/density without recording an explicit justified deviation. Do not copy donor code, logos, artwork, or proprietary assets. Use our canonical AgentSam vector and existing application registries/renderer instead.

## Mobile-first release gate (non-negotiable)

Design and visually review the smallest merchant viewport first. The required baseline is 320, 375, 390 and 430 CSS-pixel widths, then tablet (~768px), followed by desktop. A desktop-only screenshot or passing DOM/unit tests cannot approve a responsive editor. Check real viewport geometry and capture interaction screenshots on a browser; test physical iPhone Safari before claiming physical-device acceptance. Horizontal document scrolling, compressed three-column rails, unreachable Save/navigation, giant blank overlays, and inspector panels that block the selected storefront are release failures.

On phones, Theme Studio uses **one bounded work pane at a time** (Sections / Preview / Settings). The selected element remains visible in Preview; contextual miniAgentSam stays beside the selection without triggering generation. The full existing Theme Settings editor must remain reachable, not be replaced by demo fields. A generation preview belongs to the established approval-driven code stream; the selected component, live storefront and private draft must remain untouched until explicit authorized changes are accepted.

Every reference-driven change must follow: **reference contract → implementation → actual DOM/browser screenshot → visual comparison at desktop/tablet/mobile → fail on unjustified drift**. Keep the chosen reference and acceptance checks together under `docs/ui-reference/`; never claim pixel comparison when reference files are missing. Browser mount/geometry and keyboard interaction are acceptance requirements, not tests of module registration alone.

**Assistant handoff authority:** mini composer sends text to the right-docked Side Assistant. Only an action-card click opens the left-side editable request and client-only temporary tree node; only its Send may start generation. The editor's existing generation session, lock, Stop/abort, native inspector, and R2/D1 accept/publish authority remain unchanged. A generated code preview is text-only and cannot execute source HTML/JS.


Scope: `apps/ecommerce-cms-agentsam/`. Read `theme/authoring.contract.json` before editing storefront sections, blocks, or Theme Studio. This is our portable adaptation of the Shopify theme authoring guide, **not a Liquid/Shopify runtime**.

## Ownership and source of truth

Inspect existing code, schema, renderer, and tests **before adding anything**. Extend the component or contract that already owns the behavior. Never create a second page authority, editor, renderer, media store, or type registry.

| Concept | Ecommerce authority |
| --- | --- |
| Page/resource | `cms_pages`, existing route/template resolution |
| Placed section | `cms_page_sections` |
| Placed/nested block | `cms_section_blocks` |
| Reusable section/block definition | `cms_definitions` (roll out through migration; do not assume deployed) |
| Implementation and versions | `cms_artifacts`, immutable R2 objects |
| Private work, publish, history | `cms_revisions` and current publishing API |
| Global shared settings | `cms_globals` |
| Images/video | `media_assets` or existing media references |
| Products/collections/orders | Commerce resource bindings, never CMS-owned copies |

Read `backend/cms/registry.js` and `cms/block-types.json` as existing compatibility inputs. Avoid creating a competing section renderer. Introduce runtime `cms_definitions` integration only when migrated and validated against these inputs.

## Editing and composition

Pages contain sections; sections contain ordered, optionally nested blocks; settings describe merchant-facing options. **Definition != instance.** Built-in, imported, generated, packaged, and App-provided are provenance values, not editor types.

Search existing keys and schemas first; preserve stable page, section, block, and setting IDs. Treat setting keys/types/options as public APIs. Use a `cms_definitions` entry with semantic key, kind, label, category, settings schema, allowed blocks, implementation reference and provenance. Respect allowed block kinds and static/required positions. Static means structurally fixed, not inherently uneditable.

Store editable copy in section/block instance settings; site-wide settings in globals; business data as resource references; images in media; HTML/CSS/JS implementation in versioned artifacts. Keep useful presets as initial instance data, not separate page authorities.

## Theme Studio UX safety

Always open or restore a **private working revision**. Autosave never publishes. Publish is the sole deliberate live transition. Protect existing private work before changing import/reconciliation logic. Do not expose `Start editing page`, `Replace private draft`, `live-only`, or `adapter needed` in normal merchant workflows.

The left drawer navigates, the preview renders the real section, and the contextual inspector edits the selected section or block. Add Section/Block opens a visual catalog, not a scroll tunnel. Filter block choices by the containing definition. Preserve selection and scroll when the right-hand AgentSam panel opens. Contextual miniAgentSam is a fixed-height, one-line command capsule; full conversation belongs to Side Assistant.

## AgentSam generate/edit/normalize workflow

1. Inspect the intended page, selected node, existing owners, settings, and applicable contracts.
2. Classify the implementation as `native`, `artifact_static`, `artifact_interactive`, or `app`; reuse an existing semantic definition before proposing one. **Never** introduce generic `custom`/`ai_section` as the permanent type.
3. Treat the definition's declared, versioned settings schema as the public API. Initial values do not define field types. Extract merchant settings and resource references; keep code and data separate.
4. Create a temporary tree item during generation; stream honest phases and allow cancellation.
5. The current production acceptance lane is `artifact_static`: bounded, script-free HTML/CSS only. Reject JS. `artifact_interactive` is **not installable** until an explicit production runtime/capability contract is implemented; the older generated-block harness is not evidence of production support.
6. Root every CSS selector under the placed-instance scope; use `data-cms` for content and the contract's instance-scoped CSS custom-property pattern for visual values. Prefer shared theme/global tokens.
7. Keep semantic definition keys unprefixed. `agentsam_gen_` is reserved for per-instance implementation isolation; a duplicate gets a new stable instance identity while reusing the immutable artifact.
8. Store implementation as an immutable, versioned artifact; register/version the definition and insert a normal section/block instance. Preserve generation or refurbishment provenance, including source repo/commit/path/hash and license/ownership evidence when mining code.
9. Select the resulting normal tree row. Render its inspector from the definition schema. Follow-up edits produce a new artifact version under the same semantic key unless the component's meaning changes.

Generic repository/machine crawling and code mining belong to the shared AgentSam Machine/Repository layer, not the FNF Worker. FNF consumes deterministic crawl receipts and relationship evidence as inputs to this normalization contract; discovery must not automatically mutate a source repository or promote unverified code.

The generator may use any authorized provider; neither the UI nor this guide may hardcode one model. A generated section must survive the same duplicate, hide, reorder, nested-block, reload and publish path as stock.

## Styling, interaction and security

Use existing theme tokens and component owners. Keep feature CSS with its implementation, shared foundations global, and merchant-controlled values in scoped custom properties. Prefer native semantic controls. Preserve keyboard/focus behavior, ARIA names, alt text, accessible contrast, and reduced-motion behavior. Use responsive intrinsic sizes, `min-width: 0`, bounded media, text wrapping, and narrow-screen testing. Clean up observers/listeners/timers and prevent stale requests overwriting newer edits. Product widgets must preserve variant identity, inventory, quantity, pricing and checkout actions.

Do not copy Shopify-specific Liquid tags, `content_for`, `shopify_attributes`, app objects, `@theme/component`, section-renderer APIs, or translation file paths into FNF. Map those responsibilities onto our actual TS/JS, Workers, CMS and theme runtime after inspecting the code.

## Required validation before declaring done

Check schema validity, existing owner reuse, identity stability, allowed-block rules, settings references, resource/media resolution, artifact integrity, scoped CSS, independent duplicate instances, accessible and responsive preview, reduced motion, editor field round-trip, private draft persistence, refresh, and deliberate Publish. Verify desktop and narrow widths, missing/long content, and empty/populated collections. Run relevant tests and build commands; report any check **not run** as unverified.

Do not silently deploy a database migration or promote work to the live storefront. Do not invent tables such as `cms_ai_sections`, `cms_custom_sections`, or `cms_section_templates`.


---

# P0 — Standalone Ecommerce Packaging and SAM Runtime Integration

## Product authority — non-negotiable

`apps/ecommerce-cms-agentsam` is the customer-neutral, independently installable Ecommerce CMS application owned by InnerAnimalMedia.

FuelNFreetime is an installation of this product, not its identity.

**The complete application must install, build, run, and deploy without the FuelNFreetime monorepo, AgentSam SDK checkout, InnerAnimalMedia source repository, or ExecOS repository present on the target machine.**

The application may use installed Cloudflare infrastructure, authorized provider APIs, and enrolled ExecOS services. These are runtime integrations, not source-code dependencies.

Do not hardcode FuelNFreetime identifiers, domains, content, provider credentials, Cloudflare resource IDs, or sample customer defaults into the reusable product.

## 1. Application-local package ownership

Every first-party package required to build or execute Ecommerce must be delivered with its own application release.

Use `apps/ecommerce-cms-agentsam/packages/` for versioned local installable packages, or another explicitly versioned, self-contained package format within the application distribution.

Required package families include the portable SAM Kernel runtime, executable tool contracts, media processors and adapters, merchandising logic, themes, theme contracts, analytics, and other packages confirmed by the actual import graph.

Do not duplicate implementations unnecessarily. Preserve package names, public APIs, provenance and integration tests when extracting or packaging existing functionality.

The SDK remains the upstream development authority for shared SAM contracts; the Ecommerce release contains a pinned, validated distributable snapshot.

Never assume an external repository checkout exists.

Prohibit production/build dependencies such as:

- Imports escaping the application package directory.
- `file:` dependencies pointing outside the application package.
- `workspace:` references to packages absent from the application distribution.
- Hardcoded `/Users/...` or other developer-machine paths.
- Runtime imports from `agentsam-sdk`, `inneranimalmedia`, `ExecOS` or parent monorepo source folders.
- Untracked symlink targets outside the package.
- Runtime fallbacks that silently resolve missing local packages from a developer workspace.

Allowed: complete local packaged dependencies, registry-installed version-pinned dependencies, and runtime provider APIs explicitly configured by the customer installation.

## 2. Existing dependencies that must be reconciled

Audit and fix the verified external references:

- `frontend/package.json` → outer `commerce-analytics`.
- `frontend/src/pages/products/StudioWorkspace.tsx` → outer `agentsam-merch`.
- `backend/admin/store.js` → outer `heuristic-theme`.
- `backend/cms/registry.js` → outer `theme-contract`.
- `backend/admin/api.js` → outer merchandising source.
- `backend/admin/analytics-live-logs.js` → outer analytics source.
- `agentsam.app.json` → `../../features/*`.
- `bin/ecommerce.mjs` → parent-monorepo source assumptions.

Preserve existing application behavior while moving these to actual packaged dependencies. This inventory is a starting point, not a complete dependency census.

The packaging command must resolve the complete source and runtime import graph and fail on any unresolved or escaping dependency.

## 3. Integrate the generated SAM operation pack

The SDK currently contains untracked generated source at:

`agentsam-sdk/src/sam/operation-packs/generated-v2/`

Preserve it and its existing tests.

Promote the validated, portable parts into application-local versioned SAM packages.

Do not require the customer's app to import the SDK checkout. Do not make CMS or media tools depend on `sam.superbash`.

Use the existing SAM interfaces as the source contract:

- `defineSamOperation()`
- `sam.describe()`
- `sam.discover()`
- `sam.invoke()`
- Canonical tool descriptors and capability keys.
- Authenticated, resource-scoped execution contexts.
- Structured results, errors, artifacts and receipts.

Remove competing tool-name allowlists and workflow-key execution gates from the Ecommerce integration.

An operation becomes model-callable only when its actual handler, schema, resource authorization and runtime dependencies resolve.

## 4. Wire real application operations

### CMS

Bind SAM CMS operations to the actual existing Ecommerce CMS domain services.

Support inspecting, creating, updating, duplicating, hiding, moving and removing sections and blocks; editing drafts; previewing and publishing authorized page revisions.

Preserve native/generated component parity and the existing CMS/R2 artifact authority.

Ordinary merchant draft changes execute using normal authenticated permissions. Publishing is a separate, explicit authorized action.

### Media

Expose actual raster inspection, optimization, resize, crop, conversion, background removal, generation, editing, derivative history and manufacturing preflight through independently executable SAM operations.

Reuse existing Ecommerce asset queues and storage, SDK merchandising transforms, and the proven InnerAnimalMedia image-generation provider functionality.

The InnerAnimalMedia provider implementation must become a proper installable package or be extracted into portable application-owned modules. Do not import it from the original repository.

`media.image.background.remove` must be one canonical operation, supporting an accurately labeled connected-flat-background algorithm and an actually implemented subject-segmentation provider.

Wire background removal into both Media Library and Product Studio.

Do not advertise missing providers as available.

Store original/master objects and derived versions separately. Do not delete originals during transformations.

### GLB and 3D

Normalize GLB classification as 3D/model media, not video.

Provide model inspection, validation, and actual optimized derivatives through available supported processors.

Test model validity and rendered appearance before promoting a derivative. Original geometry, UVs, authored materials and animations must be preserved unless the user explicitly chooses an allowed transform profile.

### SuperBash and ExecOS

`sam.superbash` must use an authorized installed runtime or enrolled ExecOS/agentsamd connection.

It must not require a local ExecOS repository, start a new privileged tunnel implicitly, or give ordinary merchant CMS permissions host-machine access.

The agent can create, revise, save, retrieve and execute Bash scripts only on authorized runtime lanes.

## 5. Resolve identity from the installation

Use authenticated actor identity, verified account membership, installation ID and resource scope.

Do not use `FNF_ACCOUNT_ID` or substitute `CLOUDFLARE_ACCOUNT_ID` for merchant identity.

Do not accept model-supplied account IDs, roles, workspace roots or provider credentials as authority.

Preserve the existing `au_*` identity scheme through deliberate IAM/account reconciliation rather than creating a competing user system.

## 6. Fix the packaging CLI

`ecommerce doctor` must verify actual installation readiness, not merely source-file presence.

The app-level toolchain must provide:

- Dependency and import-boundary checks.
- Installed package/version and checksum inspection.
- SAM handler resolution and capability checks.
- Worker-versus-Node module boundary checks.
- Required bindings and installation configuration validation.
- CMS migrations and schema readiness checks.
- Missing provider/runtime diagnostics.
- A clean-room standalone build test.

Separate source validation, installation validation and deployment readiness. Do not report one as proof of the others.

Update the scaffold so it creates an installation from the released Ecommerce package itself, not by copying the original monorepo's root `packages`, `docs`, `db`, `public` or arbitrary scripts.

No automatic production migration or deployment during scaffolding.

## 7. Mandatory clean-room acceptance

Create a temporary directory outside all development repositories.

Copy **only the packaged `ecommerce-cms-agentsam` deliverable** into it.

Do not expose parent repository paths or depend on already installed workspace packages.

From that isolated copy, prove:

1. Dependency installation succeeds using the included manifests/lockfiles and permitted package registry.
2. Frontend and backend build successfully.
3. Cloudflare Worker compilation succeeds.
4. The real ecommerce doctor reports the package's capabilities accurately.
5. Theme Editor, Product Studio, CMS and Media Library assets are included.
6. SAM discovers all installed and executable operations.
7. A CMS draft mutation persists and reloads.
8. A raster asset can be transformed and saved as a derivative.
9. Image generation correctly identifies connected or unavailable providers.
10. Missing ExecOS reports an unavailable terminal lane without breaking Ecommerce.
11. A second tenant installs without FuelNFreetime identifiers or seeded merchant content.
12. Tests fail if an external source dependency is reintroduced.

Use isolated fixtures and test resources for any write tests; never mutate a merchant's production content to prove packaging.

## 8. Release and reporting requirements

Do not claim success based only on generated files, mocked unit tests, a copied SDK folder or a registered D1 tool row.

Required proof:

- Files changed and package manifest updates.
- Exact source provenance and pinned dependency versions.
- Source/import boundary report.
- Standalone build and runtime test results.
- Verified operation/handler/authorization matrix.
- Test evidence for CMS/media/GLB and optional provider capabilities.
- Reproducible package archive and checksum.
- Commit hashes and integration status.
- Real deployment verification only when a deployment is authorized.

Preserve all existing worktrees and active Theme Editor changes. Work in focused branches and reconcile intentionally.

**Completion means a separate customer can install and use the finished Ecommerce application without access to any of the developer's other repositories.**

Begin with the application dependency inventory and packaging CLI repair, then integrate the SAM operation pack into that self-contained distribution. Do not close out after another architecture audit.

## Product Studio and Portable Media Workbench (mandatory)

Implement and verify the cross-surface creative UI and media runtime requirements in [docs/ux/product-studio-media-workbench.md](docs/ux/product-studio-media-workbench.md). That contract includes mobile-first focused Studio mode, theme-token accents, miniAgentSam, portable image-view editing, preservation of both the @jsquash Worker and Cloudflare Images paths, and a real standalone-package release gate.
