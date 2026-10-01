# Portable control-plane schemas (tickets · memory · skills · tools · GOAP)

Apply schema families from the repo that owns them. Portable D1/ticket state and
runtime blackboard state have different baselines and must not pretend to share
one migration history.

| File | Purpose |
|------|---------|
| 0010_portable_tickets_memory.sql | Account-owned agentsam_tickets + events + agentsam_memory + outbox. account_id + repository_id NOT NULL for portable installs. |
| 0011_agentsam_skill_v2.sql | Skill identity · metrics · retrieval (3-table redesign). Legacy hosts: rename old -> agentsam_skill_legacy, backfill, verify. |
| 0012_agentsam_tools_required_seed.sql | Idempotent seed of required tool_key rows for GOAP / multitask. Manifest: registry/tools/required-seed.json. |
| 0018_goap_control_plane_remaster.sql | Additive ticket/event contract remaster: structured goal spec, structured event payloads, workflow/action linkage. No new GOAP table family and no dependency on runtime workspace tables. |
| migrations/runtime/0002_goap_blackboard_v1.sql | Evolves agentsam_workspace_state after runtime/0001 with blackboard schema identity + CAS revision. |

## Law

- NULL repository_id on portable memory/ticket/event writes = broken implementation. Resolve repo identity from agentsam inspect / snapshot before insert.
- Customer tickets and GOAP state use their D1/SQLite (or another adapter-owned store) — never IAM host ticket rows as an SDK requirement.
- Logical GOAP contracts live in @inneranimalmedia/agentsam-goap; storage tables are adapter details.
- GOAP errors use @inneranimalmedia/agentsam-errors and the shared error catalog. GOAP does not own a parallel error taxonomy.
- Cross-store GOAP mutations use an atomic MutationPort. Do not sequence ticket/blackboard/event writes independently.
- Existing workflow/execution/approval tables remain the plan/run/action/approval authorities. Do not create parallel GOAP graph tables.
- Goal focus is not execution. Creating, selecting, or activating a goal must not fabricate an agentsam_agent_run. Link a run only after the execution subsystem actually creates one.
- Portable ticket_events already has account_id + repository_id. Legacy platform event ownership is resolved through ticket_join until a host-only repair is intentionally applied.
- Portable/account-owned runtime stores may scope blackboards by repository. Shared platform stores must verify repository ownership through their repository authority (for IAM D1: code_repositories.account_id).
- agentsam_autorag stays registered for A* planning even while multi-level retrieval is incomplete.
- Skill publish uniqueness: partial unique on slash_trigger WHERE is_published = 1 is included.
