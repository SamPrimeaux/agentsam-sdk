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

-- Promote legacy PR snapshot inputs into the validated configuration contract.
-- Existing explicit values win; the snapshot is only a migration fallback.
UPDATE agentsam_widget_preferences
SET preferences_json = json_object(
  'repository', COALESCE(
    json_extract(preferences_json, '$.repository'),
    json_extract(preferences_json, '$.snapshot.repository')
  ),
  'pullNumber', COALESCE(
    CAST(json_extract(preferences_json, '$.pullNumber') AS INTEGER),
    CAST(json_extract(preferences_json, '$.snapshot.number') AS INTEGER)
  ),
  'githubAccount', COALESCE(
    json_extract(preferences_json, '$.githubAccount'),
    json_extract(preferences_json, '$.snapshot.githubAccount')
  )
)
WHERE installation_id IN (
  SELECT id FROM agentsam_widget_installations WHERE widget_key = 'pull-request-summary'
)
AND json_valid(preferences_json)
AND json_type(preferences_json, '$.snapshot') = 'object';

-- Carry the account's release target forward without copying stale display metrics.
-- Prefer explicit release config, then its old snapshot, then the same account's PR config.
UPDATE agentsam_widget_preferences
SET preferences_json = json_object(
  'repository', COALESCE(
    json_extract(preferences_json, '$.repository'),
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
  'ref', COALESCE(
    json_extract(preferences_json, '$.ref'),
    json_extract(preferences_json, '$.snapshot.ref'),
    'main'
  ),
  'githubAccount', COALESCE(
    json_extract(preferences_json, '$.githubAccount'),
    json_extract(preferences_json, '$.snapshot.githubAccount'),
    (
      SELECT json_extract(pr_preferences.preferences_json, '$.githubAccount')
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
  )
)
WHERE installation_id IN (
  SELECT id FROM agentsam_widget_installations WHERE widget_key = 'release-readiness'
)
AND json_valid(preferences_json)
AND json_type(preferences_json, '$.snapshot') = 'object';
