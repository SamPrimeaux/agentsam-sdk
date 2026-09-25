# Portable control-plane schemas (tickets · memory · skills · tools)

Apply from the repo that owns the SQL (agentsam-sdk `migrations/d1/`).

| File | Purpose |
|------|---------|
| `0010_portable_tickets_memory.sql` | Account-owned `agentsam_tickets` + events + `agentsam_memory` + outbox. `account_id` + `repository_id` **NOT NULL**. |
| `0011_agentsam_skill_v2.sql` | Skill identity · metrics · retrieval (3-table redesign). Legacy hosts: rename old → `agentsam_skill_legacy`, backfill, verify. |
| `0012_agentsam_tools_required_seed.sql` | Idempotent seed of required `tool_key` rows for GOAP / multitask. Manifest: `registry/tools/required-seed.json`. |

## Law

- **NULL `repository_id` on memory/ticket writes = broken implementation.** Resolve repo identity from `agentsam inspect` / snapshot before insert.
- Customer tickets use **their** D1/SQLite — never IAM host ticket rows.
- `agentsam_autorag` stays registered for A* planning even while multi-level retrieval is incomplete.
- Skill publish uniqueness: partial unique on `slash_trigger WHERE is_published = 1` is included.
