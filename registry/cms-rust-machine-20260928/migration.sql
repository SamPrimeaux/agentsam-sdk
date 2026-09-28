-- AgentSam CMS / Rust / machine product registry graduation.
-- Idempotent: stable product slugs + unique relationship edges.
-- Database: inneranimalmedia-business

INSERT INTO agentsam_products (
  slug, name, kind, status, description,
  repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  'cms',
  'InnerAnimalMedia CMS',
  'product',
  'wired',
  'Independent CMS product identity; portable editor/runtime surfaces inherit AgentSam capabilities.',
  'github:samprimeaux/inneranimalmedia',
  'src/core/agentsam/cms',
  NULL,
  NULL,
  '["cms","product","installable"]',
  '{"origin":"registry.cms-rust-machine-20260928","installable":true,"app_id":"client-cms-editor","install":{"command":"agentsam app scaffold client-cms-editor","paths":["/install/cms"]},"run_targets":["local","cloudflare","tauri"],"persistence":["sqlite","d1","localStorage_cache"],"cli_commands":[],"capabilities":["cms.editor","cms.pages","cms.sections","cms.components","cms.media"]}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  status=excluded.status,
  description=excluded.description,
  repository_id=COALESCE(excluded.repository_id,agentsam_products.repository_id),
  canonical_path=excluded.canonical_path,
  package_name=excluded.package_name,
  version=excluded.version,
  tags=excluded.tags,
  metadata=excluded.metadata,
  updated_at=excluded.updated_at;

INSERT INTO agentsam_products (
  slug, name, kind, status, description,
  repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  'client-cms-editor',
  'AgentSam CMS Editor',
  'app',
  'scaffolded',
  'Canonical reusable CMS editor app; donor-quality remaster is in progress behind adapter boundaries.',
  'github:samprimeaux/agentsam-sdk',
  'apps/client-cms-editor',
  '@inneranimalmedia/client-cms-editor',
  '0.1.0',
  '["cms","app","editor","installable"]',
  '{"origin":"registry.cms-rust-machine-20260928","installable":true,"app_id":"client-cms-editor","product_id":"cms","legacy_slug":"iam-client-cms-editor","install":{"command":"agentsam app scaffold client-cms-editor","paths":["/install/cms","/install/client-cms-editor"]},"run_targets":["local","cloudflare","tauri"],"persistence":["sqlite","d1","localStorage_cache"],"cli_commands":[],"capabilities":["cms.editor","cms.pages","cms.sections","cms.components","cms.media"]}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  status=excluded.status,
  description=excluded.description,
  repository_id=COALESCE(excluded.repository_id,agentsam_products.repository_id),
  canonical_path=excluded.canonical_path,
  package_name=excluded.package_name,
  version=excluded.version,
  tags=excluded.tags,
  metadata=excluded.metadata,
  updated_at=excluded.updated_at;

INSERT INTO agentsam_products (
  slug, name, kind, status, description,
  repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  'theme-inneranimals-site',
  'Inner Animals Site Theme',
  'theme',
  'prototype',
  'Harvested Inner Animals storefront/theme candidate awaiting canonical reusable theme graduation.',
  NULL,
  NULL,
  NULL,
  NULL,
  '["cms","theme","harvest","candidate"]',
  '{"origin":"registry.cms-rust-machine-20260928","installable":false,"candidate":true,"source":"harvest","capabilities":["cms.theme"]}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  status=excluded.status,
  description=excluded.description,
  repository_id=COALESCE(excluded.repository_id,agentsam_products.repository_id),
  canonical_path=excluded.canonical_path,
  package_name=excluded.package_name,
  version=excluded.version,
  tags=excluded.tags,
  metadata=excluded.metadata,
  updated_at=excluded.updated_at;

INSERT INTO agentsam_products (
  slug, name, kind, status, description,
  repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  'asrust',
  'AgentSam Rust/Wasm Edge Lab',
  'service',
  'wired',
  'Live Rust/Wasm Worker capability lab at asrust.inneranimalmedia.com.',
  NULL,
  NULL,
  NULL,
  NULL,
  '["rust","wasm","cloudflare","service"]',
  '{"origin":"registry.cms-rust-machine-20260928","runtime":"rust-wasm","deployment":{"provider":"cloudflare","url":"https://asrust.inneranimalmedia.com","state":"live"},"run_targets":["cloudflare"],"cli_commands":[],"capabilities":["rust.wasm.worker"]}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  status=excluded.status,
  description=excluded.description,
  repository_id=COALESCE(excluded.repository_id,agentsam_products.repository_id),
  canonical_path=excluded.canonical_path,
  package_name=excluded.package_name,
  version=excluded.version,
  tags=excluded.tags,
  metadata=excluded.metadata,
  updated_at=excluded.updated_at;

INSERT INTO agentsam_products (
  slug, name, kind, status, description,
  repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  'agentsam-machine',
  'AgentSam Machine',
  'service',
  'prototype',
  'Deterministic native inspect/catalog engine; native core is present while top-level agentsam machine dispatch remains pending.',
  'github:samprimeaux/agentsam-sdk',
  'native/agentsam-machine',
  NULL,
  '0.1.0',
  '["rust","native","machine","inspect"]',
  '{"origin":"registry.cms-rust-machine-20260928","installable":false,"runtime":"native-rust","run_targets":["local","tauri"],"cli_commands":[],"capabilities":["machine.inspect"],"dispatch":"pending"}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  status=excluded.status,
  description=excluded.description,
  repository_id=COALESCE(excluded.repository_id,agentsam_products.repository_id),
  canonical_path=excluded.canonical_path,
  package_name=excluded.package_name,
  version=excluded.version,
  tags=excluded.tags,
  metadata=excluded.metadata,
  updated_at=excluded.updated_at;

INSERT INTO agentsam_products (
  slug, name, kind, status, description,
  repository_id, canonical_path, package_name, version, tags, metadata, updated_at
) VALUES (
  'agentsam-rapid-rust',
  'AgentSam Rapid Rust',
  'sdk-package',
  'prototype',
  'Rust/Wasm Worker scaffolding and local proof tooling shipped inside the AgentSam SDK.',
  'github:samprimeaux/agentsam-sdk',
  'packages/agentsam-rapid-rust',
  '@inneranimalmedia/agentsam-sdk',
  '0.1.0',
  '["rust","wasm","sdk","cli","installable"]',
  '{"origin":"registry.cms-rust-machine-20260928","installable":true,"bundled_in":"@inneranimalmedia/agentsam-sdk","run_targets":["local","cloudflare"],"persistence":[],"cli_commands":["agentsam rust","agentsam wasm"],"capabilities":["rust.scaffold","rust.check","rust.build","rust.dev","rust.deploy"]}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  status=excluded.status,
  description=excluded.description,
  repository_id=COALESCE(excluded.repository_id,agentsam_products.repository_id),
  canonical_path=excluded.canonical_path,
  package_name=excluded.package_name,
  version=excluded.version,
  tags=excluded.tags,
  metadata=excluded.metadata,
  updated_at=excluded.updated_at;

-- CMS product is packaged as the canonical editor app.
INSERT INTO asset_relationships (
  source_type, source_id, target_type, target_id, relationship_type, metadata
)
SELECT 'agentsam_product', cms.id, 'agentsam_product', editor.id, 'packaged_as',
       '{"origin":"registry.cms-rust-machine-20260928","role":"editor_app"}'
FROM agentsam_products cms, agentsam_products editor
WHERE cms.slug='cms' AND editor.slug='client-cms-editor'
ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type)
DO UPDATE SET metadata=excluded.metadata;

-- Preserve the existing legacy product identity as an alias, not a second canonical editor.
INSERT INTO asset_relationships (
  source_type, source_id, target_type, target_id, relationship_type, metadata
)
SELECT 'agentsam_product', legacy.id, 'agentsam_product', editor.id, 'aliased_as',
       '{"origin":"registry.cms-rust-machine-20260928","legacy_slug":"iam-client-cms-editor"}'
FROM agentsam_products legacy, agentsam_products editor
WHERE legacy.slug='iam-client-cms-editor' AND editor.slug='client-cms-editor'
ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type)
DO UPDATE SET metadata=excluded.metadata;

-- Harvested theme candidate belongs to the CMS product family.
INSERT INTO asset_relationships (
  source_type, source_id, target_type, target_id, relationship_type, metadata
)
SELECT 'agentsam_product', theme.id, 'agentsam_product', cms.id, 'depends_on',
       '{"origin":"registry.cms-rust-machine-20260928","role":"cms_theme"}'
FROM agentsam_products theme, agentsam_products cms
WHERE theme.slug='theme-inneranimals-site' AND cms.slug='cms'
ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type)
DO UPDATE SET metadata=excluded.metadata;

-- Rapid Rust exposes the commands that are already mainline and tested.
INSERT INTO asset_relationships (
  source_type, source_id, target_type, target_id, relationship_type, metadata
)
SELECT 'agentsam_product', p.id, 'cli_command', 'agentsam:rust', 'exposes_command',
       '{"origin":"registry.cms-rust-machine-20260928","command":"agentsam rust"}'
FROM agentsam_products p
WHERE p.slug='agentsam-rapid-rust'
ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type)
DO UPDATE SET metadata=excluded.metadata;

INSERT INTO asset_relationships (
  source_type, source_id, target_type, target_id, relationship_type, metadata
)
SELECT 'agentsam_product', p.id, 'cli_command', 'agentsam:wasm', 'exposes_command',
       '{"origin":"registry.cms-rust-machine-20260928","command":"agentsam wasm"}'
FROM agentsam_products p
WHERE p.slug='agentsam-rapid-rust'
ON CONFLICT(source_type,source_id,target_type,target_id,relationship_type)
DO UPDATE SET metadata=excluded.metadata;
