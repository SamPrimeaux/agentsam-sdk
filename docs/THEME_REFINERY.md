# Theme Refinery — Archaeology → Product Graph

**Law:** discover ≠ promote · install ≠ activate · automation ≠ authority  
**SSOT for registry:** live `inneranimalmedia-business` D1 (`agentsam_products` + `asset_relationships` + evidence/artifacts)  
**SSOT for packages:** `agentsam-sdk` workspaces (`@inneranimalmedia/heuristic-theme`, `@inneranimalmedia/theme-*`)

Python owns deterministic harvest/normalize/preview/QA. AgentSam owns interpretation. **Every meaningful product unit must reconcile into D1** — filesystem-only runs are incomplete.

## Pipeline states

```
old scattered website
        ↓ discover + fingerprint          → evidence snapshot (website/repository)
        ↓ make portable                   → work/theme-harvest/<slug>/
        ↓ make previewable                → preview/ + agentsam_artifacts
        ↓ classify + document             → agentsam_products UPSERT (prototype)
        ↓ normalize structure             → apps/<slug> (scaffolded)
        ↓ map reusable features           → feature.v1 + asset_relationships
        ↓ visual/product refinement       → AgentSam (preserve design, replace plumbing)
        ↓ QA + screenshots + receipts     → quality_reports + evidence
        ↓ promote                         → production (human authority)
apps/<sellable-theme>  +  @inneranimalmedia/theme-<slug>
```

## Product unit kinds (`agentsam_products.kind`)

| Kind | Use when |
|------|----------|
| `app` | Sellable site/APP (`insurance-site`) |
| `theme` | Visual/design product or stock shell (`heuristic-theme`) |
| `sdk-package` | npm boundary (`@inneranimalmedia/theme-insurance-site`) |
| `section` / `block` | Reusable CMS pieces (also may write `cms_component_templates`) |
| `ui-component` | Header/nav shells extracted for reuse |
| `integration` | Provider adapters (Resend, Square, …) |
| `service` | Worker/backend service |
| `script` / `solution` / `collection` / `product` / `product-line` | As classified |

**Status ladder:** `prototype` → `scaffolded` → `wired` → `production` (→ `deprecated`)

UPSERT by stable `slug`. Never delete/recreate to refresh metadata.

## D1 reconciliation (required)

### 1. `agentsam_products` — canonical identity

- Resolve `repository_id` from live `code_repositories` (never invent IDs).
- Set `canonical_path` (e.g. `apps/insurance-site`, `packages/theme-insurance-site`).
- Rely on existing triggers for `defined_in` → `code_repository`.
- Provenance in `metadata` only (no secrets). See `protocol/theme-refinery/product-metadata.schema.json`.

### 2. `asset_relationships` — topology

Idempotent UPSERT on `(source_type, source_id, target_type, target_id, relationship_type)`.

Preferred verbs already in use: `defined_in`, `depends_on`, `consumed_by`, `builds_shell_for`, `integrates_with`, `packaged_as`, `runtime_for`, `exposes_tool`, `provides_workflow`, `sourced_from`, …

Example:

```
insurance-site --sourced_from--> (evidence / donor path hash)
insurance-site --packaged_as--> @inneranimalmedia/theme-insurance-site
insurance-site --depends_on--> theme.storefront.shell / cms contracts
```

### 3. `agentsam_evidence_snapshots` — point-in-time proof

Fingerprint, intake, pre/post visual, link scans.  
Product row = durable summary; snapshot = detailed evidence.

### 4. `agentsam_artifacts` — durable previews/docs

Screenshots, preview bundles, help exports. Link via relationships (`has_preview`, `documented_by` — extend vocabulary intentionally).

### 5. `agentsam_quality_reports` — only when a real report artifact exists

### 6. `cms_themes` vs product identity

Style tokens → `cms_themes`. Sellable APP → `agentsam_products`. Link; do not substitute.

### 7. `cms_component_templates`

Only for extracted reusable sections/blocks — not whole sites.

### 8. Discovery inputs (merge automatically)

- `~/company-map/machine/projects.json` + `git-roots.json`
- `~/IAM-Library/01_Template_Candidates`
- live D1 `apps` (historical inventory — discovery/backfill only)
- existing `agentsam_products` + `code_repositories`
- explicit donor roots

`apps` / `client_apps` are **not** the new SSOT. Backfill into `agentsam_products`.

## CLI surface (target)

```
agentsam theme harvest <path>     # archaeology packet + evidence + product UPSERT (prototype)
agentsam theme preview <slug>     # gallery-ready artifacts
agentsam theme normalize <slug>   # proposed plan (scaffolded/wired)
agentsam theme promote <slug>     # human-gated → production
agentsam themes                   # status table from D1 + filesystem
```

## Reconciliation receipt

Every run emits `ThemeRefineryReconciliationReceipt` (`protocol/theme-refinery/reconciliation-receipt.schema.json`):

discovered / matched / registered / updated / unchanged products · repositories resolved · relationships · evidence · artifacts · quality reports · CMS themes/templates · tools/workflows linked · duplicates · promotions · failures.

**Run incomplete if only files were written.**

## Packages (current)

| Package | Role |
|---------|------|
| `@inneranimalmedia/heuristic-theme` | Stock CMS `theme.storefront.shell` |
| `@inneranimalmedia/theme-<slug>` | Installable gallery theme contracts |
| `apps/theme-gallery-preview` | Proving surface / historical mounts — not the package SSOT |

Preserve design, replace plumbing: old auth/email/uploads/CMS → current feature vocabulary.
