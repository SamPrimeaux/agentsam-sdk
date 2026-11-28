-- Replace fixture-only widget adapters with the live host adapters.
UPDATE agentsam_widget_catalog
SET data_adapter_key = 'queues.observability'
WHERE widget_key = 'queues';

UPDATE agentsam_widget_catalog
SET data_adapter_key = 'github.pull-request'
WHERE widget_key = 'pull-request-summary';

UPDATE agentsam_widget_catalog
SET data_adapter_key = 'github.commit-readiness'
WHERE widget_key = 'release-readiness';

-- Preserve the selected PR target while discarding its stale presentation snapshot.
UPDATE agentsam_widget_preferences
SET preferences_json = json_object(
  'repository', json_extract(preferences_json, '$.snapshot.repository'),
  'pullNumber', CAST(json_extract(preferences_json, '$.snapshot.number') AS INTEGER)
)
WHERE installation_id IN (
  SELECT id FROM agentsam_widget_installations WHERE widget_key = 'pull-request-summary'
)
AND json_valid(preferences_json)
AND json_type(preferences_json, '$.snapshot') = 'object'
AND json_extract(preferences_json, '$.snapshot.repository') IS NOT NULL
AND json_extract(preferences_json, '$.snapshot.number') IS NOT NULL;

-- Track the same account's configured PR repository on the release widget, defaulting to main.
UPDATE agentsam_widget_preferences
SET preferences_json = json_object(
  'repository', COALESCE(
    json_extract(preferences_json, '$.snapshot.repository'),
    (
      SELECT json_extract(pr_preferences.preferences_json, '$.repository')
      FROM agentsam_widget_installations release_installation
      JOIN agentsam_widget_installations pr_installation
        ON pr_installation.account_id = release_installation.account_id
        AND pr_installation.surface = release_installation.surface
        AND pr_installation.widget_key = 'pull-request-summary'
        AND pr_installation.instance_key = 'default'
        AND pr_installation.enabled = 1
      JOIN agentsam_widget_preferences pr_preferences
        ON pr_preferences.installation_id = pr_installation.id
      WHERE release_installation.id = agentsam_widget_preferences.installation_id
      LIMIT 1
    )
  ),
  'ref', 'main'
)
WHERE installation_id IN (
  SELECT id FROM agentsam_widget_installations WHERE widget_key = 'release-readiness'
)
AND json_valid(preferences_json)
AND json_type(preferences_json, '$.snapshot') = 'object';
