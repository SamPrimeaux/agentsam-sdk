-- agentsam-engine: d1
-- Link Gmail tools to the google_gmail OAuth plugin so tool_count and readiness reflect reality.
-- Idempotent: only touches rows that are still unlinked. Applied manually to prod first.
UPDATE agentsam_tools
SET plugin_id  = (SELECT id         FROM agentsam_plugins WHERE provider_key = 'google_gmail' AND plugin_kind = 'oauth' LIMIT 1),
    plugin_key = (SELECT plugin_key FROM agentsam_plugins WHERE provider_key = 'google_gmail' AND plugin_kind = 'oauth' LIMIT 1)
WHERE plugin_id IS NULL
  AND (tool_name LIKE 'gmail\_%' ESCAPE '\' OR tool_name LIKE 'agentsam\_gmail\_mcp\_%' ESCAPE '\');
