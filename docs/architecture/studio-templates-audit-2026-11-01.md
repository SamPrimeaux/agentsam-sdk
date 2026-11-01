# Audit — `studio_templates` vs code-owned inventories (2026-11-01)

**Source:** live D1 `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) + remote R2 `cad` object fetch.  
**Rule:** Code defines how to work with templates. D1 + R2 define which templates exist and what they contain.

## Eight verification answers

| # | Question | Evidence |
|---|---|---|
| 1 | How many **active** `studio_templates`? | **7** (status=`active`; total rows=7) |
| 2 | How many have valid R2 payload refs? | **7/7** have `payload_bucket_id` + `payload_r2_key`. **0/7** have preview refs. Matching `r2_objects` rows: **7**. Live R2 fetch of `cad/studio-templates/cad-creator/platform/modern_villa/v1/project.json` succeeded (4264 bytes JSON). |
| 3 | Which `app_id` values? | **`cad-creator` only** |
| 4 | Which `resource_kind` values? | **`cad_project_template` only** |
| 5 | MovieMode / SamSketch / CAD represented? | **CAD yes (7).** MovieMode **no**. SamSketch **no** (0 `r2_objects` keys matching moviemode/copro/samsketch; 0 studio rows). |
| 6 | Who reads/writes the table? | **Writers/ops:** `scripts/platform-resource-rebuild/*` (`06_register_stock_library.py`, backfill/validate). **No app runtime consumer found** in `agentsam-sdk` or `inneranimalmedia` Worker code that `SELECT`s `studio_templates`. CAD Creator UI loads **`apps/cad-creator/frontend/src/lib/templates.ts` (`TEMPLATES`)** instead. |
| 7 | R2 objects without DB records? | Under `studio-templates/%`: **0 orphans** in `r2_objects`. Broader inventory: `r2_buckets` has **114** rows; `r2_objects` only **71** indexed objects — inventory is partial (`r2_cad.inventory_status=partial`, `total_objects=4` vs 7 catalogued template object rows). |
| 8 | Does `CREATIVE_TEMPLATES` duplicate these? | **Not the same records.** `CREATIVE_TEMPLATES` is **18** code-owned MovieMode compositions (`creative:*`). `studio_templates` is **7** CAD project templates (`tpl_cad_*`). **Architectural duplication:** both invent an inventory authority outside the other. MovieMode never registered into `studio_templates`; CAD registered into D1/R2 **and** still hardcodes the same seven payloads in `templates.ts`. |

## Related tables

### `r2_buckets` (canonical bucket identity for `studio_templates`)

- Template payloads reference `payload_bucket_id → r2_buckets.id` (e.g. `r2_cad` → bucket_name `cad`, binding `CAD_PROJECT_ASSETS`).
- **Does not** reference `project_storage`.

### `project_storage` (19 rows)

- Tenant/project storage *registration*, not template inventory.
- Type inconsistency: `r2` / `R2` / `r2_bucket`.
- Duplicate logical names: `ps_r2_dashboard` + `ps_iam_r2` → `agent-sam`; `ps_iam_r2_docs` + `ps_r2_iam_docs` → `iam-docs`.
- Most `storage_url` null; `project_id` / `workspace_id` optional.

### `cms_component_templates_backup` (39 rows, legacy)

- CMS/section/motion/loading templates; **6** have `r2_key`; not a creative-app project-template authority.
- Do not reintroduce as runtime catalogue.

## Lifecycle that already exists (CAD path)

```text
studio_templates row
  → r2_buckets (r2_cad)
  → payload_r2_key on R2 cad/
  → (intended) schema + renderer_key
  → application instantiate → distinct project → persist
```

**Gap:** apps do not yet walk this path at runtime. CAD and MovieMode both fall back to code-owned inventories.

## Correction direction (no new registries)

1. Stop treating `CREATIVE_TEMPLATES` / `TEMPLATES` as discover authorities.
2. Keep `copro-templates` / CAD shared packages for **schemas, validation, rendering, instantiation**.
3. `listProjectTemplates()` (and CAD gallery) must query **`studio_templates`** (filtered by `app_id` / `resource_kind`) and load payloads from R2.
4. Register MovieMode compositions into `studio_templates` + R2 if they are product templates — do not leave them only in JS.
5. Wire CAD Creator to the seven existing D1/R2 records before adding more CAD starters in code.
6. Do not merge presentation renames or parallel catalogues as “done.”

Blocked work: PR #427’s “CREATIVE_TEMPLATES as authority” claim must be revised against this audit.
