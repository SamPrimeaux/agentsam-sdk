# D1 reconciliation contract (theme refinery)

Target DB: **inneranimalmedia-business** (live AgentSam product graph).

## Invariant

```sql
SELECT slug, kind, status, repository_id, canonical_path
FROM agentsam_products
ORDER BY kind, name;
```

must answer current inventory. From any row, `asset_relationships` answers defined_in / sourced_from / depends_on / consumed_by / exposes_tool / provides_workflow. Evidence + artifacts answer what was observed and what preview/QA supports promotion.

## Product UPSERT (pseudocode)

```sql
INSERT INTO agentsam_products (
  id, account_id, slug, name, kind, status,
  repository_id, canonical_path, metadata, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
ON CONFLICT(account_id, slug) DO UPDATE SET
  name = excluded.name,
  kind = excluded.kind,
  status = excluded.status,
  repository_id = COALESCE(excluded.repository_id, agentsam_products.repository_id),
  canonical_path = excluded.canonical_path,
  metadata = excluded.metadata,
  updated_at = excluded.updated_at;
```

- Resolve `repository_id` via `code_repositories` lookup (repo URL / name / path). **Never invent.**
- Existing triggers emit `defined_in` when `repository_id` is set — do not duplicate manually.

## Relationship UPSERT

Honor uniqueness on `(source_type, source_id, target_type, target_id, relationship_type)`.

## Evidence

Write `agentsam_evidence_snapshots` with `snapshot_type` in (`repository`,`website`,`seo`,`business`), same `account_id` as product/repo.

## Do not

- Dual-write every product into legacy `apps` by default (backfill *from* `apps` only).
- Register whole sites as `cms_component_templates` or only as `cms_themes`.
- Stuff giant archaeology JSON or secrets into `agentsam_products.metadata`.
- Emit tools/workflows/skills/hooks unless formally exposed.
