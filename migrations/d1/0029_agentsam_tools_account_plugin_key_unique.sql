-- agentsam-engine: d1
-- Forward-only transition of installed tool identity to stable plugin_key.
-- Retain plugin_id, its FK, and the legacy index while older consumers exist.
-- Existing installed tools must not lose their plugin ownership or approval policy.

UPDATE agentsam_tools
   SET plugin_key = (
     SELECT p.plugin_key FROM agentsam_plugins AS p
      WHERE p.id = agentsam_tools.plugin_id
      LIMIT 1
   )
 WHERE plugin_id IS NOT NULL
   AND (plugin_key IS NULL OR trim(plugin_key) = '')
   AND EXISTS (
     SELECT 1 FROM agentsam_plugins AS p
      WHERE p.id = agentsam_tools.plugin_id
        AND p.plugin_key IS NOT NULL AND trim(p.plugin_key) != ''
   );

-- New canonical per-account uniqueness. The old plugin_id-based index remains
-- for rollback compatibility; do not rebuild agentsam_tools (many FK/view users).
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_tools_account_plugin_key_tool_key
ON agentsam_tools(account_id, plugin_key, tool_key)
WHERE account_id IS NOT NULL
  AND plugin_key IS NOT NULL AND trim(plugin_key) != ''
  AND tool_key IS NOT NULL AND trim(tool_key) != '';
