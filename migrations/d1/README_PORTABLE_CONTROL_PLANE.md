# Portable control-plane schemas (tickets · memory · skills · tools · GOAP)

Apply from the repo that owns the SQL (agentsam-sdk migrations/d1/).

| File | Purpose |
|------|---------|
| 0010_portable_tickets_memory.sql | Account-owned agentsam_tickets + events + agentsam_memory + outbox. account_id + repository_id NOT NULL for portable installs. |
| 0011_agentsam_skill_v2.sql | Skill identity · metrics · retrieval (3-table redesign). Legacy hosts: rename old -> agentsam_skill_legacy, backfill, verify. |
| 0012_agentsam_tools_required_seed.sql | Idempotent seed of required tool_key rows for GOAP / multitask. Manifest: registry/tools/required-seed.json. |
| 0018_goap_control_plane_remaster.sql | Additive contract remaster over existing workspace/ticket/event tables: blackboard schema + CAS revision, structured goal spec, scoped structured events, workflow/action linkage. No new GOAP table family. |

## Law

- NULL repository_id on portable memory/ticket/event writes = broken implementation. Resolve repo identity from agentsam inspect / snapshot before insert.
- Customer tickets and GOAP state use their D1/SQLite (or another adapter-owned store) — never IAM host ticket rows as an SDK requirement.
- Logical GOAP contracts live in @inneranimalmedia/agentsam-goap; storage tables are adapter details.
- Existing workflow/execution/approval tables remain the plan/run/action/approval authorities. Do not create parallel GOAP graph tables.
- agentsam_autorag stays registered for A* planning even while multi-level retrieval is incomplete.
- Skill publish uniqueness: partial unique on slash_trigger WHERE is_published = 1 is included.
