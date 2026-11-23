# Batch 1 — SDK ↔ production D1 registry reconciliation

Audit date: 2026-11-22. Read-only inspection of the local AgentSam SDK checkout and Cloudflare D1 **inneranimalmedia-business**. No production rows, schema, access controls or installs were modified.

## Provenance and boundaries

- SDK inspected on the user's iMac at `/Users/samprimeaux/agentsam-sdk`, HEAD `5f4a81154` (`ci/ui-evidence-main-only-20261122`), one commit ahead of local `main` at `4c818a9ed`. This audit PR is independently branched from GitHub `main`; it does **not** merge the user's local branch.
- Production data read through the connected Cloudflare D1 account, database name `inneranimalmedia-business` (UUID `cf87b717-d4e2-4cf8-bab0-a81268e32d49`).
- Counts are a point-in-time database snapshot, not a release guarantee. Source inventory counts describe files/manifests; a manifest is not proof of a working deployed route or independent marketplace product.

## SDK source inventory

| Source | Count | Meaning |
|---|---:|---|
| `**/agentsam.app.json` | 15 | App and nested embedded/host manifests; heterogeneous schemas |
| `skills/*/SKILL.md` | 39 | SDK root skills |
| `skills/*/agentsam.skill.json` | 26 at audit start; **39 after Batch 1 PR** | All SDK source skill directories now have adjacent metadata; 15 are intentionally excluded from npm packaging until reviewed |
| `src/cli/command-catalog.js` | 80 | Runtime catalog entries, computed via module import (not text-pattern count) |
| `scripts/**/*.mjs` | 85 | Source scripts (not all cataloged DB scripts) |
| `packages/catalog/generated/packages.json` | 55 | Generated canonical package catalog entries |
| `getCapabilityManifest().capabilities` | 93 | Source capability definitions |

Current source registration implementations: `src/cli/command-catalog.js`, `src/skills/registry.js`, `src/tools/registry.js`, `scripts/registry/generate.mjs`, `apps/local-studio/backend/worker/app-registry.js`, and `apps/local-studio/backend/worker/apps-launcher.js`.

`scripts/registry/generate.mjs` generates a command/capability/package inventory. It does not synchronize apps, skills, scripts, hooks, tools and their production D1 metadata into a unified catalog. The `apps-launcher.js` path uses `apps` + `agentsam_app_installations` but currently lists only active public applications.

## Production D1 inventory

| Table | Rows | Notes |
|---|---:|---|
| `apps` | 28 | 9 active public applications, 18 private/null-type legacy rows, 1 private site |
| `agentsam_app_installations` | 8 | 8 enabled installs across 1 account |
| `agentsam_plugins` | 40 | Separate plugin authority |
| `agentsam_plugin_installations` | 153 | Account-scoped plugin installations |
| `agentsam_tools` | 262 | 244 active; 26 CMS-handler tools |
| `agentsam_skill` | 100 | 0 marked published; 0 with npm package name; 34 empty content bodies |
| `agentsam_scripts` | 395 | 388 active; 384 empty inline bodies but paths/source pointers populated |
| `agentsam_commands` | 36 | 34 active; 2 workspace scopes, mostly workspace slash commands |
| `agentsam_hook` | 86 | Definitions |
| `agentsam_hook_execution` | 40 | Execution rows |
| `agentsam_rules_document` | 44 | 43 active; content nonempty |
| `agentsam_capabilities` | 102 | D1 catalog differs from 93 source capabilities; requires ID-level diff |
| `agentsam_tool_capabilities` | 187 | Existing tool-capability mapping |
| `agentsam_service_registry` | 17 | Service entries |
| `agentsam_widget_catalog` | 23 | Widgets, not automatically Apps |

Additional evidence: 1,223 command runs, 60 script runs, and zero `agentsam_skill_invocation` rows in the inspected table. Do not infer that no skills ran anywhere: other execution logs may be authoritative.

## Public app catalog and install status

| Application ID | D1 installations |
|---|---:|
| `agentsamforms` | 1 |
| `cad-creator` | 1 |
| `database-editor` | 1 |
| `design-canvas` | 1 |
| `ecommerce-cms-agentsam` | 1 |
| `goalguru` | 1 |
| `growth` | 0 |
| `moviemode` | 1 |
| `samsketch` | 1 |

App-manifest IDs without an exact `apps.id` match (7/15):

| Manifest | Intended reconciliation |
|---|---|
| `samspeaks` | **MovieMode voice/direction module**, reusable elsewhere. Do not register an independently installable application. |
| `agentsam-copro-studio` | **MovieMode editor/production module**. Canonical product identity remains `moviemode`, alongside SamSpeaks and media capabilities; do not create a duplicate public app. |
| `product-studio` | Declared `role: embedded-app` under ecommerce; integrate as a CMS/commerce surface, not automatically a separate installable app. |
| `completeful` | Existing `agentsam_plugins.plugin_key='completeful'` provider. Do not duplicate plugin registration as public application. |
| `resend` | Existing `agentsam_plugins.plugin_key='resend'` API provider. Do not duplicate. |
| `local-studio` | Independently installable **platform desktop/web host**, with account sign-up/sign-in and shared hosted authority. Do not register it as an app offered inside itself. |
| `agentsam-workbench` | Shared UI/runtime infrastructure, not a consumer-facing installable app. |

The user has also classified **Database Editor** as a reusable module, rather than a standalone marketed app. Production retains an app row and installation; migrate its routing and user entitlement before changing that row. See `docs/architecture/app-module-plugin-classification.md`.

Further app-like surfaces such as `project-control`, `agentsam-browser-site`, `agentsam-go-worker`, frontend routes and native stage plugins require explicit **host/subsystem/embedded app/independent app/plugin** classification before registration. Do not derive marketplace items from every route.

Existing 18 legacy private rows with null `app_type` must remain private until ownership, provenance and intended product type are established.

## Source versus npm distribution — follow-up finding

A local `npm pack --dry-run --ignore-scripts --json` against the current SDK checkout included **24** of the **39** root `SKILL.md` files; at audit start only **12** of those packaged directories had adjacent JSON metadata. The Batch 1 source implementation adds the missing 13 manifests, bringing **39/39 source declarations and 24/24 configured npm-selected declarations**. It does **not** change the package's `files` allowlist to publish the other 15 without review. The skill loaders now avoid advertising unshipped built-in skill documents.

## Blocking schema and policy discrepancies

1. **Skill package uniqueness:** live `agentsam_skill` uses `UNIQUE(npm_package_name,npm_version)`, preventing 39 distinct skills from declaring the same bundled npm package version. Repair package-to-skill identity/uniqueness before metadata sync; retain uniqueness of account/slash trigger and avoid unsafe cross-account visibility. `account_id` is NOT NULL, so first-party content needs an explicit platform/system catalog ownership strategy, not a personal-account shortcut.
2. **Command namespace mismatch:** 80 SDK CLI roots versus 36 D1 workspace slash commands; IDs and execution semantics differ. Keep both namespaces and add a typed registry mapping (CLI root, slash trigger, handler kind/reference, provenance), rather than overwriting existing shortcuts. `agentsam_commands.workspace_id` is NOT NULL.
3. **Migration parity:** production has `agentsam_commands`, `agentsam_scripts`, and `agentsam_rules_document` DDL, but their complete create-table definitions were not found in the inspected SDK migration directories. Restore canonical idempotent migrations with checks/indexes; reconcile with the live schema before applying.
4. **Tool policy:** all 262 inspected tool rows have `is_global=1`; 28 also have an `account_id`. Nine active `completeful_*__fuelnfreetime` CMS tool rows use `workspace_scope='["*"]'`, `is_global=1`, and have an `account_id`. These are **policy inconsistencies requiring enforcement inspection**, not proof of a data leak. Do not propagate customer-scoped tools into platform/global catalogs by default.
5. **Source-to-D1 skills:** none of the 39 SDK skill directory names matched live `agentsam_skill` ID, name or slash trigger exactly in the audited snapshot. A semantic equivalence and provenance audit is still required before calling every live row obsolete.
6. **Script bodies:** 384/395 script records have blank inline `body`, but paths and `source_stored` pointers are populated. Resolve external references before labeling the scripts missing or deprecated.
7. **App routing:** `apps-launcher.js` filters to `visibility='public'` and does not provide an authorized private-account app listing; finish the identity-backed path without making private apps public.

## Batch 1 implementation sequence

1. Produce normalized, read-only **source + D1 reconciliation evidence** keyed by `kind`, canonical ID, source manifest path, package/version, handler/routing contract, owner scope and content checksum; include collision/alias reports.
2. Restore migration DDL for the existing tables and fix skill/package uniqueness with a non-destructive migration and tests. Preserve records and IDs.
3. Define distinct catalogs: platform capability declarations; platform Apps; integration plugins; site-scoped embedded apps; per-account installations/permissions. A manifestation of a package is not proof of runtime readiness or entitlement.
4. Build idempotent, diff-first upsert adapters for reviewed SDK apps and skills, then tools/commands/scripts/hooks/rules. Mark `published` and `active` from verifiable state; do not auto-promote staging/legacy content.
5. Audit runtime authorization for global/account/site/workspace tools, especially the nine client-specific Completeful bindings. Test account A/account B isolation and deny-by-default tool discovery.
6. Prove end to end: source declaration -> registered catalog -> authorized discovery -> installation -> supported web/desktop launch -> actual handler execution -> audit trace. Include malformed manifests, duplicate IDs and disabled capabilities in negative tests.
7. Register reviewed missing applications only after deployed-route, identity and ownership acceptance. Do not mass-write into production as a shortcut.

### Release gates

- `scripts/registry/generate.mjs --check` remains clean.
- First-party skills receive stable metadata without violating npm/package uniqueness.
- No accidental promotion of 18 private legacy rows.
- Existing app installations remain intact; new app registration cannot silently install products for users.
- No duplicate MovieMode/CoPro or provider-as-app rows.
- A clean D1 bootstrap yields the same required table contracts as production.
- Cross-account tests verify that client-specific tools cannot be discovered or executed across tenant boundaries.
- Production writes are separately reviewed after a read-only diff and migration preflight.

> Status: **audit baseline plus source-only skill manifest/loader fixes**. All 39 source skill manifests were validated and the targeted skill regressions passed (27/27). No production D1 migration, selective data cleanup, or application catalog registration has been applied.
