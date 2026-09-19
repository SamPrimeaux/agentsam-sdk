# Agent & Orchestration

Spawning subagents, running workflows, planning, multitask fan-out, and repo intelligence for an agent's own reasoning.

**17 tools** in this domain.

## `agent` (1)

- **`agentsam_run_agent`** (Run Agent Workflow) — Execute an agentsam workflow by workflow_key (async graph runner). Requires approval in registry. _risk: high, never used_

## `agent.admin` (1)

- **`agentsam_tools_sync_projection`** (Sync Tool Search Projection) — Operator-only sync of canonical D1 agentsam_tools into the rebuildable Supabase semantic tool projection. D1 remains tools/list and execution authority. _risk: high, never used_

## `agent.discovery` (1)

- **`agentsam_search_tools`** (Search tools) — Discover Agent Sam catalog tools by capability, intent, category, or name. Returns ranked tool_key matches from agentsam_tools. Prefer exact tool_key when known. _never used_

## `agent.execute` (5)

- **`agentsam_create_subagent`** (Create Subagent) — Create a custom subagent profile row in agentsam_subagent_profile for this user and workspace.
- **`agentsam_get_agent`** (Get Agent) — Get one subagent profile by slug from agentsam_subagent_profile. _never used_
- **`agentsam_list_agents`** (List Agents) — List subagent profiles from agentsam_subagent_profile for this user and workspace (includes platform-global templates). _never used_
- **`agentsam_plan`** (Create Plan) — Create or read workspace plans. Call with {} to create using the default goal, or read: true to fetch the active plan. _never used_
- **`agentsam_spawn_profile`** (Spawn Subagent) — Spawn a child agent profile by slug. Creates agentsam_spawn_session row. Enforces max_spawn_depth. _never used_

## `agent.repo` (1)

- **`agentsam_repo_intelligence`** (Repo Intelligence) — Deterministic Git historian for architecture triage. mode=overview ranks hotspots/stability/coupling; add path_prefix and/or domain to inspect a subtree or classified domain instead of the whole repo; mode=focus + path is a one-file autopsy. Target another bound checkout with github_repo / workspace_slug / workspace_id (never a filesystem path). Optional since_days (7-365) and top_k (5-40). Not for exact symbol lookup.

## `platform.orchestration` (4)

- **`agentsam_multitask_cancel`** (Multitask Cancel) — Force-stop a multitask fanout by spawn_job_id. Sets cancel_requested=1 AND status=cancelled on parent + all child agent runs, closes agentsam_spawn_job. Use when soft cancel left lanes running/billing. Poll agentsam_multitask_status after. _risk: high, never used_
- **`agentsam_multitask_spawn`** (Multitask Spawn) — Spawn 1..N child agent lanes (Cursor Task-style). Parent chat orchestrates; this tool only creates the fanout. Returns spawn_job_id + child_run_ids immediately; poll agentsam_multitask_status. Each lane REQUIRES role_slug (active agentsam_subagent_profile.slug) — no default remap. Optional timeout_seconds / lane_timeout_seconds. Requires allow_subagent_spawn; child loops run when allow_fanout_execution=1. _risk: high, never used_
- **`agentsam_multitask_status`** (Multitask Status) — Poll multitask fanout by spawn_job_id. Returns lanes with status (queued|running|cancelling|cancelled|done|failed|awaiting_approval), cancel_requested, cost_usd, open_lane_count, ledger_diverged. If open_lane_count>0 use agentsam_multitask_cancel. _never used_
- **`agentsam_spawn_tree`** (Inspect Spawn Tree) — READ-ONLY inspect of parent/child agent runs sharing a chain_root_id. Provide run_id or conversation_id. Does not spawn. Use agentsam_multitask_spawn to create lanes, agentsam_multitask_status to poll. _never used_

## `platform.staging` (1)

- **`agentsam_stage_file`** (Stage File) — Provisionally stage a file to R2 (conversation-scoped). Destination-agnostic — does NOT write GitHub tip, Local FSA, or sandbox root. Prefer this for new HTML/CSS/JS/landing pages and iterative drafts. Re-call with the same path to update. Returns staged_ref; ship via a separate tool later. Args: path (relative), content (required), mime (optional). _never used_

## `workflow.context` (1)

- **`workflow_context_resolve`** (Workflow Context Resolve) — Resolve only the conversation, repository, and artifact references explicitly supplied to a reusable workflow. Account id is the ownership authority; unsupported source kinds remain reference-only. _never used_

## `workflow.execute` (2)

- **`agentsam_workflow_status`** (Workflow Status) — Returns recent workflow run statuses for this workspace. _**inactive**, never used_
- **`agentsam_workflow_trigger`** (Workflow Trigger) — Start a registered workflow for this workspace (POST /api/agent/workflow/start). _never used_
