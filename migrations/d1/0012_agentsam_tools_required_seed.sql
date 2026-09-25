-- 0012_agentsam_tools_required_seed.sql
-- Registers required tool_key stubs for new projects.
-- Full handler schemas live in the host agentsam_tools registry; this seed
-- guarantees GOAP / search_tools / multitask can resolve the required set.
-- Idempotent: skips rows that already exist by tool_key.

INSERT INTO agentsam_tools (
  id, tool_name, tool_key, tool_code, display_name, tool_category,
  handler_type, description, is_active, risk_level, domain, account_id
)
SELECT
  'ast_req_' || lower(hex(randomblob(6))),
  key,
  key,
  key,
  key,
  'platform',
  'terminal',
  'Required AgentSam tool seed · see registry/tools/required-seed.json',
  1,
  'low',
  'general',
  '*'
FROM (
  SELECT 'fs_read_file' AS key UNION ALL SELECT 'fs_write_file' UNION ALL SELECT 'fs_edit_file'
  UNION ALL SELECT 'fs_list_dir' UNION ALL SELECT 'fs_search_files'
  UNION ALL SELECT 'agentsam_filesystem_walk' UNION ALL SELECT 'agentsam_filesystem_stat_many'
  UNION ALL SELECT 'agentsam_filesystem_hash_many' UNION ALL SELECT 'agentsam_filesystem_git_status'
  UNION ALL SELECT 'agentsam_github_read' UNION ALL SELECT 'agentsam_github_write'
  UNION ALL SELECT 'agentsam_github_pr' UNION ALL SELECT 'agentsam_github_pr_merge'
  UNION ALL SELECT 'agentsam_github_issue' UNION ALL SELECT 'agentsam_github_search'
  UNION ALL SELECT 'agentsam_github_tree' UNION ALL SELECT 'agentsam_github_read_many'
  UNION ALL SELECT 'agentsam_github_patch' UNION ALL SELECT 'agentsam_github_grep'
  UNION ALL SELECT 'agentsam_github_create_repo' UNION ALL SELECT 'agentsam_grep'
  UNION ALL SELECT 'browser_navigate'
  UNION ALL SELECT 'agentsam_memory_search' UNION ALL SELECT 'agentsam_memory_manager'
  UNION ALL SELECT 'agentsam_memory_commit'
  UNION ALL SELECT 'agentsam_d1_query' UNION ALL SELECT 'agentsam_d1_write'
  UNION ALL SELECT 'agentsam_supabase_query' UNION ALL SELECT 'agentsam_supabase_write'
  UNION ALL SELECT 'agentsam_supabase_vector'
  UNION ALL SELECT 'agentsam_r2_get' UNION ALL SELECT 'agentsam_r2_put' UNION ALL SELECT 'agentsam_r2_delete'
  UNION ALL SELECT 'agentsam_cf_vectorize' UNION ALL SELECT 'agentsam_cf_d1_list'
  UNION ALL SELECT 'agentsam_cf_workers_list' UNION ALL SELECT 'agentsam_cf_worker_get'
  UNION ALL SELECT 'agentsam_cf_worker_code'
  UNION ALL SELECT 'agentsam_autorag'
  UNION ALL SELECT 'agentsam_terminal_local' UNION ALL SELECT 'agentsam_terminal_sandbox'
  UNION ALL SELECT 'agentsam_terminal_remote'
  UNION ALL SELECT 'agentsam_create_subagent' UNION ALL SELECT 'agentsam_container_exec'
  UNION ALL SELECT 'search_cloudflare_documentation' UNION ALL SELECT 'agentsam_spawn_tree'
  UNION ALL SELECT 'agentsam_run_agent'
  UNION ALL SELECT 'agentsam_ticket_list' UNION ALL SELECT 'agentsam_ticket_get'
  UNION ALL SELECT 'agentsam_ticket_create' UNION ALL SELECT 'agentsam_ticket_set_status'
  UNION ALL SELECT 'agentsam_code_interpreter'
  UNION ALL SELECT 'cad_generate' UNION ALL SELECT 'cad_job_cancel' UNION ALL SELECT 'cad_job_status'
  UNION ALL SELECT 'agentsam_search_tools'
  UNION ALL SELECT 'agentsam_codebase_retrieve' UNION ALL SELECT 'agentsam_knowledge_ingest_segment'
  UNION ALL SELECT 'agentsam_multitask_spawn' UNION ALL SELECT 'agentsam_multitask_status'
  UNION ALL SELECT 'agentsam_multitask_cancel'
  UNION ALL SELECT 'agentsam_merkle_build' UNION ALL SELECT 'agentsam_merkle_get'
  UNION ALL SELECT 'agentsam_merkle_compare' UNION ALL SELECT 'agentsam_merkle_explain'
  UNION ALL SELECT 'agentsam_merkle_delete'
  UNION ALL SELECT 'agentsam_repo_intelligence' UNION ALL SELECT 'agentsam_code_index_build'
  UNION ALL SELECT 'agentsam_repository_snapshot'
) AS required
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_tools t WHERE t.tool_key = required.key OR t.tool_name = required.key
);
