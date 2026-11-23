# AgentSam package identity and installability — Batch 1 design contract

Status: **reviewed classification direction; not an active schema migration**. Use alongside `docs/audits/2026-11-22-sdk-d1-registry-parity.md`.

## Problem

`agentsam.app.json` currently means several incompatible things: an independently launchable surface, an embedded feature, an integration, a host, and a reusable runtime package. Blindly inserting one `apps` row for each manifest would duplicate user-facing products, install infrastructure, and incorrectly expose scoped providers.

For AgentSam, *installable application* is a product/catalog identity with authenticated lifecycle and supported launch surfaces. A module or plugin may contain substantial code and/or its own UI without being a separately installable application.

## Target taxonomy

| Kind | Meaning | User-facing install lifecycle | Examples |
|---|---|---|---|
| distribution / host | Installer, shell or platform entry point | Distribution/identity lifecycle, not a merchant app catalog row by default | Local Studio for macOS, platform web shell |
| application | Cohesive product with supported launch surface | Yes, when product/release eligible | MovieMode, Ecommerce CMS |
| module | Feature/experience hosted inside an app, optionally independently packaged | No independent install by default | CoPro timeline/editor, SamSpeaks voice/direction, Product Studio, Database Editor |
| plugin | Explicitly connected provider/extension with grant/config scope | Plugin installation/connection | Completeful, Resend |
| shared capability | Portable implementation consumed by multiple products | Package dependency, not customer installation | agentsam-workbench, database services, IAMScene |
| site | Customer-owned rendered website or store | Site/theme publication lifecycle | CMS sites; never conflated with app catalog |

**A single product may consume multiple independently versioned packages.** Product identity is not package nesting. Local Studio desktop and web must access the same account-owned authorized capabilities rather than fork their own catalogs.

## Decisions for current mismatches

- `local-studio` → platform host/distribution. Explicit downloadable, sign-up and sign-in lifecycle. Do not represent it as another ordinary installable *within itself*.
- `moviemode` → canonical application ID. `agentsam-copro-studio` is its packaged editor/core module; `samspeaks` contributes voice/direction functionality. **Do not register three consumer apps**.
- `completeful` / `resend` → existing `agentsam_plugins` providers, with account/site-scoped connections and grants.
- `database-editor` → shared module accessible from relevant application surfaces, not a standalone public marketplace pitch. Production `apps` currently has this as public with an existing installation. Preserve that installation and provide routing/compatibility reconciliation before any catalog demotion.
- `product-studio` → commerce module owned by the CMS product experience.
- `agentsam-workbench` → reusable shell/runtime, not an app.
- `samsketch`, `cad-creator`, `design-canvas`, `goalguru`, `growth`, `agentsamforms` → hold their current installation records; validate independent-product versus feature-module identity in a dedicated acceptance matrix, not by file count.
- Legacy private `apps` rows → preserve tenant ownership; do not promote to public applications.

## Manifest contract direction

Retain reading legacy `agentsam.app.v1` manifests. The proposed **versioned common package manifest** must distinguish `kind` and `installability` explicitly and validate:

- Canonical ID, package identity, version and lifecycle maturity
- Product identity vs distribution ID vs module ID, with explicit `part_of` references
- Eligible surfaces (web, desktop, mobile, embedded), mounts and routing
- Dependencies/required capabilities and extension points, with portable semver contracts
- Authentication, tenant/site scoping and permissions/grants
- Runtime/handler target and release or deployment evidence
- Registration provenance and catalog eligibility, independent of whether the source file exists

Do not silently rename all `agentsam.app.json` files to a new format yet. Implement a validated legacy adapter and an inventory report first; then roll out one authoritative declaration format rather than creating a competing bespoke manifest per package kind.

## Skills, scripts and D1 rebuild policy

Source manifests for all 39 SDK skills are now required by a test. This is **metadata completion only**, not an automatic production import, activation, npm release or endorsement of old playbooks. Root `SKILL.md` remains the instruction source.

The 100 existing D1 skills and 395 scripts require archival/provenance classification. The user has indicated much of that content is outdated. For any future canonical schema rebuild:

1. Export a restorable snapshot of current data and record counts, hashes and source pointers.
2. Validate any live references, installation grants, script/run history, and active consumers before switching schemas.
3. Reconcile existing table names and necessary DDL. Do not fork into alternative product-specific registries.
4. Add explicit provenance/lifecycle states (`discovered`, `reviewed`, `active`, `deprecated`, `archived`) to the canonical registration contract, with validated capability and handler references.
5. Populate the active catalogs **selectively**, only after a candidate has been reviewed. Never mark a skill `is_published` merely because `SKILL.md` exists.
6. Migrate existing identity/revision/run data without losing referential integrity or audit records.
7. Apply tenant/site/workspace authorization tests before any production sync.

Do not truncate or drop the production `agentsam_skill`, `agentsam_scripts` or `agentsam_commands` tables as part of manifest coverage work.

## Acceptance gates

- 39/39 root skills have valid adjacent `agentsam.skill.v1` metadata and a non-empty `SKILL.md`.
- Existing SDK built-in trigger precedence and catalog aliases are not changed by this metadata-only slice.
- No new production app, plugin, skill or script activation.
- No extra consumer-facing MovieMode/SamSpeaks/CoPro identities.
- Migration PRs demonstrate exact live table compatibility, reversible data preservation and scoped execution.
