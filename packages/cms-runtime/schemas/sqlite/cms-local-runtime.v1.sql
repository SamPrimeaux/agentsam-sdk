PRAGMA foreign_keys = ON;

-- Canonical portable CMS content model.
CREATE TABLE IF NOT EXISTS cms_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  edited TEXT NOT NULL DEFAULT 'just now',
  color TEXT NOT NULL DEFAULT '#1e6a6f',
  theme_json TEXT,
  schemas_json TEXT
);

CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES cms_sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  type TEXT NOT NULL DEFAULT 'Interior',
  parent TEXT,
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cms_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'BODY',
  visible INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#111115',
  fields_json TEXT NOT NULL DEFAULT '{}',
  css_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cms_blocks (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES cms_sections(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS cms_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT,
  snapshot_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_publications (
  page_id TEXT PRIMARY KEY REFERENCES cms_pages(id) ON DELETE CASCADE,
  publication_id TEXT NOT NULL,
  route TEXT NOT NULL,
  revision_num INTEGER NOT NULL,
  theme TEXT NOT NULL DEFAULT 'default',
  sections_json TEXT NOT NULL,
  published_at TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS cms_assets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES cms_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  url TEXT,
  asset_key TEXT,
  created_at TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_site ON cms_pages(site_id);
CREATE INDEX IF NOT EXISTS idx_cms_sections_page ON cms_sections(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_blocks_section ON cms_blocks(section_id);
CREATE INDEX IF NOT EXISTS idx_cms_revisions_page ON cms_revisions(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_assets_site ON cms_assets(site_id);

-- Self-describing runtime contract.
CREATE TABLE IF NOT EXISTS cms_runtime_info (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cms_table_catalog (
  table_name TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  authority TEXT NOT NULL,
  mutation_policy TEXT NOT NULL,
  owner_contract TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_capability_catalog (
  capability_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  authority TEXT NOT NULL,
  contract_ref TEXT,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_tool_catalog (
  tool_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  availability TEXT NOT NULL CHECK (
    availability IN ('sql', 'adapter_required', 'external_command', 'optional')
  ),
  description TEXT NOT NULL,
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  output_schema_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  mutates INTEGER NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  invocation_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cms_skill_catalog (
  skill_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('human', 'agent', 'both')),
  description TEXT NOT NULL,
  when_to_use TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  tool_keys_json TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1'
);

CREATE TABLE IF NOT EXISTS cms_usage_guides (
  guide_key TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('human', 'agent', 'both')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS cms_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS cms_runtime_help AS
SELECT
  guide_key,
  audience,
  title,
  summary,
  body_text
FROM cms_usage_guides
ORDER BY sort_order, guide_key;

CREATE VIEW IF NOT EXISTS cms_runtime_tools AS
SELECT
  tool_key,
  display_name,
  category,
  availability,
  risk_level,
  mutates,
  requires_approval,
  description,
  invocation_json,
  notes
FROM cms_tool_catalog
ORDER BY category, tool_key;

CREATE VIEW IF NOT EXISTS cms_runtime_tables AS
SELECT
  table_name,
  role,
  authority,
  mutation_policy,
  owner_contract,
  description
FROM cms_table_catalog
ORDER BY table_name;

INSERT OR REPLACE INTO cms_runtime_info(key, value, description) VALUES
  ('schema', 'inneranimalmedia.cms.local-runtime.v1', 'Self-describing local CMS runtime schema.'),
  ('cms_contract', 'cms-core.v1', 'Logical CMS contract implemented by this SQLite database.'),
  ('provider', 'sqlite', 'Physical database provider for this runtime.'),
  ('mode', 'local_authority', 'local_authority means this database is CMS truth; local_working_copy means it is disposable and another adapter is authoritative.'),
  ('content_store', 'filesystem', 'Default local object storage provider paired with this SQLite runtime.'),
  ('mutation_api', 'CmsEditorAdapter', 'Prefer adapter operations for mutations that create revisions/publications or enforce product invariants.'),
  ('safe_direct_sql', 'read-mostly', 'Direct SQL inspection is safe; complex mutations should use CmsEditorAdapter tools.'),
  ('start_human', 'SELECT * FROM cms_runtime_help WHERE audience IN (''human'',''both'');', 'First query for a human operator.'),
  ('start_agent', 'SELECT * FROM cms_runtime_help WHERE audience IN (''agent'',''both'');', 'First query for an automated agent.'),
  ('tools_query', 'SELECT * FROM cms_runtime_tools;', 'Discover tool contracts and invocation requirements.'),
  ('tables_query', 'SELECT * FROM cms_runtime_tables;', 'Discover table meaning and mutation policy.');

INSERT OR REPLACE INTO cms_table_catalog VALUES
  ('cms_sites', 'site identity and configuration', 'cms_core', 'adapter_preferred', 'CmsEditorAdapter', 'Sites and their portable theme/schema metadata.'),
  ('cms_pages', 'page records', 'cms_core', 'adapter_preferred', 'CmsEditorAdapter', 'Pages belonging to a site.'),
  ('cms_sections', 'ordered page sections', 'cms_core', 'adapter_preferred', 'CmsEditorAdapter', 'Sections, fields, CSS metadata, visibility, and order.'),
  ('cms_blocks', 'ordered section blocks', 'cms_core', 'adapter_preferred', 'CmsEditorAdapter', 'Structured blocks inside sections.'),
  ('cms_revisions', 'draft/revision history', 'cms_core', 'adapter_only', 'CmsEditorAdapter', 'Immutable revision snapshots. Do not hand-edit in ordinary workflows.'),
  ('cms_publications', 'published snapshots', 'cms_core', 'adapter_only', 'CmsEditorAdapter', 'Current publication state. Publish through the adapter rather than writing rows directly.'),
  ('cms_assets', 'asset metadata', 'cms_core', 'adapter_preferred', 'CmsEditorAdapter', 'Asset metadata; bytes may live in filesystem/R2/S3 depending on adapter.'),
  ('cms_runtime_info', 'runtime identity/help', 'runtime_catalog', 'system_managed', 'cms-local-runtime.v1', 'Key runtime facts and operator entry points.'),
  ('cms_table_catalog', 'schema semantics', 'runtime_catalog', 'system_managed', 'cms-local-runtime.v1', 'Explains table role, authority, and mutation policy.'),
  ('cms_capability_catalog', 'capability discovery', 'runtime_catalog', 'system_managed', 'cms-local-runtime.v1', 'Logical capability/provider map for humans and agents.'),
  ('cms_tool_catalog', 'tool discovery', 'runtime_catalog', 'system_managed', 'cms-local-runtime.v1', 'Tools that can inspect or operate this runtime.'),
  ('cms_skill_catalog', 'workflow discovery', 'runtime_catalog', 'system_managed', 'cms-local-runtime.v1', 'Reusable human/agent workflows over CMS tools.'),
  ('cms_usage_guides', 'operator guidance', 'runtime_catalog', 'system_managed', 'cms-local-runtime.v1', 'Human- and agent-readable usage instructions.');

INSERT OR REPLACE INTO cms_capability_catalog VALUES
  ('database', 'storage', 'sqlite', 1, 'ready', 'local_authority', 'cms-core.v1', 'Durable CMS state for sites, pages, sections, blocks, revisions, publications, and asset metadata.'),
  ('object_storage', 'storage', 'filesystem', 1, 'ready', 'local_authority', 'cms-package.v2', 'Local asset/content bytes; path comes from the package manifest.'),
  ('drafts', 'workflow', 'CmsEditorAdapter', 1, 'ready', 'cms_core', 'CmsEditorAdapter', 'Explicit Save Draft boundary backed by revisions.'),
  ('preview', 'workflow', 'CmsEditorAdapter', 1, 'ready', 'cms_core', 'CmsEditorAdapter', 'Preview a saved draft without changing published state.'),
  ('publication', 'workflow', 'CmsEditorAdapter', 1, 'ready', 'cms_core', 'CmsEditorAdapter', 'Explicit Publish boundary producing a publication snapshot.'),
  ('tools', 'discovery', 'sqlite_catalog', 1, 'ready', 'runtime_catalog', 'cms-local-runtime.v1', 'Tool contracts live in cms_tool_catalog.'),
  ('skills', 'discovery', 'sqlite_catalog', 1, 'ready', 'runtime_catalog', 'cms-local-runtime.v1', 'Workflow recipes live in cms_skill_catalog.'),
  ('ai', 'optional', 'none', 0, 'optional', 'external', 'cms-package.v2', 'AI is optional augmentation and is never required for ordinary CMS CRUD.');

INSERT OR REPLACE INTO cms_tool_catalog VALUES
  ('cms.runtime.inspect', 'Inspect CMS runtime', 'inspect', 'sql',
   'Read runtime identity, mode, provider, and operator entry points.',
   '{}', '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT key,value,description FROM cms_runtime_info ORDER BY key;"}',
   'Safe first tool for humans or agents.'),
  ('cms.schema.inspect', 'Inspect CMS schema contract', 'inspect', 'sql',
   'Read table roles, authority, and mutation policies.',
   '{}', '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT * FROM cms_runtime_tables;"}',
   'Use before writing direct SQL.'),
  ('cms.site.list', 'List CMS sites', 'read', 'sql',
   'List sites available in this runtime.',
   '{}', '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT id,name,domain,color FROM cms_sites ORDER BY name;"}',
   ''),
  ('cms.page.list', 'List pages for a site', 'read', 'sql',
   'List pages by site_id.',
   '{"type":"object","required":["site_id"],"properties":{"site_id":{"type":"string"}}}',
   '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT * FROM cms_pages WHERE site_id = ? ORDER BY sort_order,slug;","params":["site_id"]}',
   ''),
  ('cms.section.list', 'List sections for a page', 'read', 'sql',
   'List ordered page sections.',
   '{"type":"object","required":["page_id"],"properties":{"page_id":{"type":"string"}}}',
   '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT * FROM cms_sections WHERE page_id = ? ORDER BY sort_order,id;","params":["page_id"]}',
   ''),
  ('cms.block.list', 'List blocks for a section', 'read', 'sql',
   'List ordered blocks inside a section.',
   '{"type":"object","required":["section_id"],"properties":{"section_id":{"type":"string"}}}',
   '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT * FROM cms_blocks WHERE section_id = ? ORDER BY sort_order,id;","params":["section_id"]}',
   ''),
  ('cms.revision.list', 'List page revisions', 'read', 'sql',
   'Inspect revision history without changing it.',
   '{"type":"object","required":["page_id"],"properties":{"page_id":{"type":"string"}}}',
   '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT id,kind,created_at,label FROM cms_revisions WHERE page_id = ? ORDER BY created_at DESC;","params":["page_id"]}',
   ''),
  ('cms.publication.get', 'Get published snapshot', 'read', 'sql',
   'Read current publication metadata for a page.',
   '{"type":"object","required":["page_id"],"properties":{"page_id":{"type":"string"}}}',
   '{"type":"object"}', 'low', 0, 0,
   '{"sql":"SELECT * FROM cms_publications WHERE page_id = ?;","params":["page_id"]}',
   ''),
  ('cms.asset.list', 'List site assets', 'read', 'sql',
   'Read asset metadata for a site.',
   '{"type":"object","required":["site_id"],"properties":{"site_id":{"type":"string"}}}',
   '{"type":"array"}', 'low', 0, 0,
   '{"sql":"SELECT * FROM cms_assets WHERE site_id = ? ORDER BY created_at DESC,name;","params":["site_id"]}',
   ''),
  ('cms.draft.save', 'Save Draft', 'write', 'adapter_required',
   'Persist a draft through CmsEditorAdapter so revision invariants are preserved.',
   '{"type":"object","required":["page_id"],"properties":{"page_id":{"type":"string"}}}',
   '{"type":"object"}', 'medium', 1, 0,
   '{"adapter":"CmsEditorAdapter","method":"saveDraft"}',
   'Do not emulate this by writing cms_revisions manually.'),
  ('cms.preview.draft', 'Preview Draft', 'preview', 'adapter_required',
   'Render/resolve the saved draft without changing published state.',
   '{"type":"object","required":["page_id"],"properties":{"page_id":{"type":"string"}}}',
   '{"type":"object"}', 'low', 0, 0,
   '{"adapter":"CmsEditorAdapter","method":"previewDraft"}',
   ''),
  ('cms.publish', 'Publish Page', 'publish', 'adapter_required',
   'Promote an approved revision to the published snapshot.',
   '{"type":"object","required":["page_id"],"properties":{"page_id":{"type":"string"},"revision_id":{"type":"string"}}}',
   '{"type":"object"}', 'high', 1, 1,
   '{"adapter":"CmsEditorAdapter","method":"publish"}',
   'High-risk durable boundary. Preview/validate first.'),
  ('cms.asset.upload', 'Upload Asset', 'write', 'adapter_required',
   'Store bytes through the configured object-storage adapter and metadata in cms_assets.',
   '{"type":"object","required":["site_id","file"],"properties":{"site_id":{"type":"string"}}}',
   '{"type":"object"}', 'medium', 1, 0,
   '{"adapter":"CmsEditorAdapter","method":"uploadAsset"}',
   ''),
  ('cms.manifest.validate', 'Validate CmsPackage manifest', 'verify', 'external_command',
   'Validate and compile the package capability graph.',
   '{}', '{"type":"object"}', 'low', 0, 0,
   '{"command":"python3 scripts/validate-cms-package.py manifests/cms-package.v2.local.example.json --compile --json"}',
   'Repository tooling; not required by the runtime DB itself.'),
  ('cms.portability.audit', 'Run portability audit', 'verify', 'external_command',
   'Scan for tenant/provider assumptions before distribution.',
   '{}', '{"type":"object"}', 'low', 0, 0,
   '{"command":"python3 scripts/audit-portability.py . --json-out /tmp/cms-portability.json"}',
   'Repository tooling for maintainers.');

INSERT OR REPLACE INTO cms_skill_catalog VALUES
  ('cms.inspect-before-edit', 'Inspect before editing', 'both',
   'Understand authority and current content before changing anything.',
   'Use at the start of a human or agent editing session.',
   '["cms.runtime.inspect","cms.schema.inspect","cms.site.list","cms.page.list","cms.section.list","cms.block.list"]',
   '["cms.runtime.inspect","cms.schema.inspect","cms.site.list","cms.page.list","cms.section.list","cms.block.list"]',
   '1'),
  ('cms.safe-draft-edit', 'Edit through durable draft boundaries', 'both',
   'Inspect the page tree, make changes through the adapter, Save Draft, then preview.',
   'Use for any content or structure mutation that should not immediately affect production.',
   '["inspect selected page/section/block","apply edit through CmsEditorAdapter","cms.draft.save","cms.preview.draft","verify published snapshot is unchanged"]',
   '["cms.section.list","cms.block.list","cms.draft.save","cms.preview.draft","cms.publication.get"]',
   '1'),
  ('cms.publish-safely', 'Publish a verified revision', 'both',
   'Promote only a verified saved revision through the adapter publication boundary.',
   'Use after draft preview and validation are complete.',
   '["cms.preview.draft","review diff/acceptance","cms.publish","cms.publication.get"]',
   '["cms.preview.draft","cms.publish","cms.publication.get"]',
   '1'),
  ('cms.asset-workflow', 'Inspect and manage assets', 'both',
   'Treat cms_assets as metadata and route bytes through the configured object-storage adapter.',
   'Use when browsing or adding media.',
   '["cms.asset.list","select storage adapter","cms.asset.upload","verify metadata"]',
   '["cms.asset.list","cms.asset.upload"]',
   '1'),
  ('cms.portability-preflight', 'Portability preflight', 'agent',
   'Validate package configuration and scan runtime source before packaging/distribution.',
   'Use before release or when harvesting donor code.',
   '["cms.manifest.validate","cms.portability.audit","review blockers","rerun tests"]',
   '["cms.manifest.validate","cms.portability.audit"]',
   '1');

INSERT OR REPLACE INTO cms_usage_guides VALUES
  ('human-start', 'human', 'Start here', 'Inspect runtime and content before editing.',
   'Run SELECT * FROM cms_runtime_info ORDER BY key; then SELECT * FROM cms_runtime_tools;. Direct SELECT queries are safe. Prefer CmsEditorAdapter for Save Draft, Publish, revision restore, and asset writes.', 10),
  ('agent-start', 'agent', 'Agent start here', 'Discover authority, tools, and mutation boundaries before acting.',
   'First read cms_runtime_info, cms_runtime_tables, cms_runtime_tools, and cms_skill_catalog. Never infer a remote authority from the presence of this SQLite file. If mode=local_working_copy, treat this DB as disposable. Use adapter_required tools for durable mutations.', 20),
  ('authority-modes', 'both', 'Authority modes', 'Know whether local SQLite is truth or a working copy.',
   'local_authority: this SQLite DB is the CMS source of truth until explicitly migrated. local_working_copy: another configured adapter is authoritative; this DB may be rebuilt and must not silently overwrite remote state.', 30),
  ('mutation-rules', 'both', 'Mutation rules', 'Use raw SQL for inspection; use the adapter for product invariants.',
   'Safe direct operations are primarily SELECTs. Changes to revisions, publications, assets, section ordering, block ordering, and draft state should go through CmsEditorAdapter unless a migration explicitly says otherwise.', 40),
  ('recovery', 'both', 'Recovery and verification', 'Verify the DB before and after important operations.',
   'Use PRAGMA integrity_check; inspect cms_revisions before restore; inspect cms_publications after publish; keep external asset bytes separate from cms_assets metadata.', 50);

INSERT OR REPLACE INTO cms_schema_migrations(version, description)
VALUES ('cms-local-runtime.v1', 'Canonical cms-core tables plus self-describing runtime/tool/skill catalogs.');
