-- 0023: per-install health roll-up + registry dark icon (both read by the runtime and Settings UI).
ALTER TABLE agentsam_plugins ADD COLUMN icon_dark_url TEXT;

ALTER TABLE agentsam_plugin_installations ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (health_status IN ('unknown','healthy','degraded','unhealthy','unreachable','auth_error','disabled'));
ALTER TABLE agentsam_plugin_installations ADD COLUMN last_health_at INTEGER;
ALTER TABLE agentsam_plugin_installations ADD COLUMN last_healthy_at INTEGER;
ALTER TABLE agentsam_plugin_installations ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_plugin_installations ADD COLUMN avg_latency_ms REAL;
ALTER TABLE agentsam_plugin_installations ADD COLUMN last_error_code TEXT;
ALTER TABLE agentsam_plugin_installations ADD COLUMN last_error_message TEXT;

UPDATE agentsam_plugin_installations SET
  last_health_at = (SELECT MAX(h.completed_at) FROM agentsam_plugin_health_checks h
                    WHERE h.plugin_id = agentsam_plugin_installations.plugin_id AND h.account_id = agentsam_plugin_installations.account_id),
  last_healthy_at = (SELECT MAX(h.completed_at) FROM agentsam_plugin_health_checks h
                    WHERE h.plugin_id = agentsam_plugin_installations.plugin_id AND h.account_id = agentsam_plugin_installations.account_id AND h.status = 'healthy'),
  health_status = COALESCE((SELECT CASE WHEN h.status IN ('healthy','degraded','unhealthy','unreachable','auth_error','disabled') THEN h.status ELSE 'unknown' END
                    FROM agentsam_plugin_health_checks h
                    WHERE h.plugin_id = agentsam_plugin_installations.plugin_id AND h.account_id = agentsam_plugin_installations.account_id
                    ORDER BY h.completed_at DESC LIMIT 1), 'unknown');

-- Per-account surface preferences (inherit the registry default at install, then user-editable).
ALTER TABLE agentsam_plugin_installations ADD COLUMN composer_visible INTEGER NOT NULL DEFAULT 1 CHECK (composer_visible IN (0,1));
ALTER TABLE agentsam_plugin_installations ADD COLUMN settings_visible INTEGER NOT NULL DEFAULT 1 CHECK (settings_visible IN (0,1));
UPDATE agentsam_plugin_installations SET
  composer_visible = (SELECT p.composer_visible FROM agentsam_plugins p WHERE p.id = agentsam_plugin_installations.plugin_id),
  settings_visible = (SELECT p.settings_visible FROM agentsam_plugins p WHERE p.id = agentsam_plugin_installations.plugin_id);

-- Installs created from the public catalog use instance_key 'catalog-v1' (drives the OAuth connect flow).
UPDATE agentsam_plugin_installations SET instance_key = 'catalog-v1'
  WHERE plugin_id IN (SELECT id FROM agentsam_plugins WHERE json_extract(metadata_json, '$.source') LIKE '%/catalog/plugins%');
UPDATE agentsam_plugin_installations SET composer_visible = 1 WHERE instance_key = 'catalog-v1' AND setup_status = 'connected';
