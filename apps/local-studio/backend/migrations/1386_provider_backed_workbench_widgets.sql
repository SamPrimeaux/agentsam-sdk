-- agentsam-engine: d1
-- Promote three Workbench widgets to real, read-only provider-backed capabilities.
-- OAuth credentials and provider account ownership remain in the existing connector systems.
-- This migration stores catalog metadata only; it never stores tokens or provider data.

INSERT INTO agentsam_widget_catalog (
  widget_key, name, description, category, version, icon_key,
  package_name, component_key, default_size, supported_sizes_json,
  required_capabilities_json, data_adapter_key, action_adapter_key,
  config_schema_json, tags_json, is_builtin, is_enabled
) VALUES
(
  'cloudflare-resources', 'Cloudflare Resources',
  'R2 buckets, Images and Stream inventory from your authorized Cloudflare account.',
  'glance', '2.6.18', 'cloud',
  '@inneranimalmedia/agentsam-workbench', 'CloudflareResourcesWidget', 'medium', '["medium","large"]',
  '["cloudflare.r2.read","cloudflare.images.read","cloudflare.stream.read"]',
  'provider.cloudflare.resources', NULL, '{}',
  '["cloudflare","r2","images","stream","oauth"]', 1, 1
),
(
  'github-activity', 'GitHub Activity',
  'Recently updated repositories, default branches and visibility from your connected GitHub account.',
  'glance', '2.6.18', 'git-branch',
  '@inneranimalmedia/agentsam-workbench', 'GitHubActivityWidget', 'medium', '["medium","large"]',
  '["github.repositories.read"]',
  'provider.github.repositories', NULL, '{}',
  '["github","git","repositories","oauth"]', 1, 1
),
(
  'google-drive-recent', 'Google Drive Recent Files',
  'Recently modified files from your authorized Google Drive connection. Read-only.',
  'content', '2.6.18', 'hard-drive',
  '@inneranimalmedia/agentsam-workbench', 'GoogleDriveRecentWidget', 'medium', '["medium","large"]',
  '["google_drive.files.read"]',
  'provider.google_drive.recent', NULL, '{}',
  '["google","google-drive","drive","files","oauth"]', 1, 1
)
ON CONFLICT(widget_key) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  icon_key = excluded.icon_key,
  package_name = excluded.package_name,
  component_key = excluded.component_key,
  default_size = excluded.default_size,
  supported_sizes_json = excluded.supported_sizes_json,
  required_capabilities_json = excluded.required_capabilities_json,
  data_adapter_key = excluded.data_adapter_key,
  config_schema_json = excluded.config_schema_json,
  tags_json = excluded.tags_json,
  is_builtin = excluded.is_builtin,
  is_enabled = excluded.is_enabled,
  updated_at = unixepoch();
