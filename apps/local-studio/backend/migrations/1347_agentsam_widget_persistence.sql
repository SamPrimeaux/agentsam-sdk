-- agentsam-engine: d1
-- Widget persistence for AgentSam Studio.
--
-- Runtime truth remains in existing authorities:
--   agentsam_plugins
--   agentsam_agent_run
--   agentsam_approval_queue
--   agent_request_queue
--   terminal_jobs
--   agentsam_artifacts
--   telemetry_traces
--   usage_events
--   agentsam_cron_runs
--
-- These tables store only:
--   catalog metadata
--   user installations
--   user layout
--   user widget preferences

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agentsam_widget_catalog (
  id TEXT PRIMARY KEY
    DEFAULT ('wcat_' || lower(hex(randomblob(8)))),

  widget_key TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',

  icon_key TEXT,

  package_name TEXT,
  component_key TEXT NOT NULL,

  default_size TEXT NOT NULL DEFAULT 'small',
  supported_sizes_json TEXT NOT NULL DEFAULT '["small"]'
    CHECK (json_valid(supported_sizes_json)),

  required_capabilities_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(required_capabilities_json)),

  data_adapter_key TEXT,
  action_adapter_key TEXT,

  config_schema_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(config_schema_json)),

  tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(tags_json)),

  is_builtin INTEGER NOT NULL DEFAULT 0
    CHECK (is_builtin IN (0,1)),

  is_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (is_enabled IN (0,1)),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_catalog_category
  ON agentsam_widget_catalog(category, is_enabled);

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_catalog_package
  ON agentsam_widget_catalog(package_name);


CREATE TABLE IF NOT EXISTS agentsam_widget_installations (
  id TEXT PRIMARY KEY
    DEFAULT ('winst_' || lower(hex(randomblob(8)))),

  account_id TEXT NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  user_id TEXT NOT NULL,

  widget_key TEXT NOT NULL
    REFERENCES agentsam_widget_catalog(widget_key)
    ON DELETE CASCADE,

  -- Allows multiple configured instances of one widget, e.g.
  -- weather:new-york and weather:baton-rouge.
  instance_key TEXT NOT NULL DEFAULT 'default',

  surface TEXT NOT NULL DEFAULT 'widgets_home',

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0,1)),

  pinned INTEGER NOT NULL DEFAULT 0
    CHECK (pinned IN (0,1)),

  hidden INTEGER NOT NULL DEFAULT 0
    CHECK (hidden IN (0,1)),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE (
    account_id,
    user_id,
    widget_key,
    surface,
    instance_key
  )
);

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_installations_user_surface
  ON agentsam_widget_installations(
    account_id,
    user_id,
    surface,
    hidden,
    enabled
  );

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_installations_pinned
  ON agentsam_widget_installations(
    account_id,
    user_id,
    pinned
  )
  WHERE pinned = 1;


CREATE TABLE IF NOT EXISTS agentsam_widget_layouts (
  id TEXT PRIMARY KEY
    DEFAULT ('wlay_' || lower(hex(randomblob(8)))),

  account_id TEXT NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  user_id TEXT NOT NULL,

  installation_id TEXT NOT NULL
    REFERENCES agentsam_widget_installations(id)
    ON DELETE CASCADE,

  surface TEXT NOT NULL DEFAULT 'widgets_home',

  breakpoint TEXT NOT NULL DEFAULT 'base',

  size_class TEXT NOT NULL DEFAULT 'small',

  position_x INTEGER,
  position_y INTEGER,

  order_index INTEGER NOT NULL DEFAULT 0,

  is_docked INTEGER NOT NULL DEFAULT 0
    CHECK (is_docked IN (0,1)),

  collapsed INTEGER NOT NULL DEFAULT 0
    CHECK (collapsed IN (0,1)),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE (
    installation_id,
    surface,
    breakpoint
  )
);

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_layouts_surface
  ON agentsam_widget_layouts(
    account_id,
    user_id,
    surface,
    breakpoint,
    order_index
  );

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_layouts_dock
  ON agentsam_widget_layouts(
    account_id,
    user_id,
    is_docked,
    order_index
  )
  WHERE is_docked = 1;


CREATE TABLE IF NOT EXISTS agentsam_widget_preferences (
  id TEXT PRIMARY KEY
    DEFAULT ('wpref_' || lower(hex(randomblob(8)))),

  account_id TEXT NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  user_id TEXT NOT NULL,

  installation_id TEXT NOT NULL UNIQUE
    REFERENCES agentsam_widget_installations(id)
    ON DELETE CASCADE,

  preferences_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(preferences_json)),

  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_widget_preferences_user
  ON agentsam_widget_preferences(
    account_id,
    user_id
  );


-- Seed only the packaged widget that currently exists in the real SDK
-- registry. Do not seed the visual-demo cards until their adapters/components
-- actually exist in package authority.

INSERT OR IGNORE INTO agentsam_widget_catalog (
  widget_key,
  name,
  description,
  category,
  version,
  icon_key,
  package_name,
  component_key,
  default_size,
  supported_sizes_json,
  required_capabilities_json,
  data_adapter_key,
  action_adapter_key,
  is_builtin,
  is_enabled
)
VALUES (
  'countdown',
  'Countdown',
  'Compact deadline-based timer for focus blocks, launch windows, and task checkpoints.',
  'utility',
  '1.0.0',
  'clock-3',
  '@inneranimalmedia/agentsam-workbench/widgets',
  'CountdownWidget',
  'small',
  '["small","medium"]',
  '[]',
  'utility.countdown',
  'utility.countdown',
  1,
  1
);
