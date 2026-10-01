-- Tool identity has two valid scopes:
--
-- 1. Global catalog tools:
--      account_id IS NULL
--      tool_key remains globally unique.
--
-- 2. Installed account/plugin tools:
--      account_id + plugin_id + tool_key is unique.
--
-- The previous global tool_key uniqueness prevented the same packaged
-- plugin from being installed for more than one AgentSam account.

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_tools_global_tool_key
ON agentsam_tools(tool_key)
WHERE
  account_id IS NULL
  AND tool_key IS NOT NULL
  AND trim(tool_key) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_tools_account_plugin_tool_key
ON agentsam_tools(account_id, plugin_id, tool_key)
WHERE
  account_id IS NOT NULL
  AND plugin_id IS NOT NULL
  AND tool_key IS NOT NULL
  AND trim(tool_key) != '';

DROP INDEX IF EXISTS idx_agentsam_tools_tool_key;
