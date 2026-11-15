-- agentsam-engine: d1
-- 1) Widget persistence is account-scoped only: auth_users.id (au_*) is the identity,
--    so user_id is gone everywhere. All three tables were verified empty and unused by
--    code before this rebuild. Layouts and preferences reach their account through
--    installation_id; their overlapping surface/id columns are cut.
DROP TABLE IF EXISTS agentsam_widget_preferences;
DROP TABLE IF EXISTS agentsam_widget_layouts;
DROP TABLE IF EXISTS agentsam_widget_installations;

CREATE TABLE agentsam_widget_installations (
  id TEXT PRIMARY KEY DEFAULT ('winst_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  widget_key TEXT NOT NULL REFERENCES agentsam_widget_catalog(widget_key) ON DELETE CASCADE,
  -- Multiple configured instances of one widget, e.g. weather:new-york and weather:baton-rouge.
  instance_key TEXT NOT NULL DEFAULT 'default',
  surface TEXT NOT NULL DEFAULT 'widgets_home',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (account_id, widget_key, surface, instance_key)
);
CREATE INDEX idx_agentsam_widget_installations_pinned
  ON agentsam_widget_installations(account_id, pinned) WHERE pinned = 1;
CREATE INDEX idx_agentsam_widget_installations_surface
  ON agentsam_widget_installations(account_id, surface, hidden, enabled);

CREATE TABLE agentsam_widget_layouts (
  id TEXT PRIMARY KEY DEFAULT ('wlay_' || lower(hex(randomblob(8)))),
  installation_id TEXT NOT NULL REFERENCES agentsam_widget_installations(id) ON DELETE CASCADE,
  breakpoint TEXT NOT NULL DEFAULT 'base',
  size_class TEXT NOT NULL DEFAULT 'small',
  position_x INTEGER,
  position_y INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_docked INTEGER NOT NULL DEFAULT 0 CHECK (is_docked IN (0,1)),
  collapsed INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (installation_id, breakpoint)
);
CREATE INDEX idx_agentsam_widget_layouts_dock
  ON agentsam_widget_layouts(installation_id, is_docked, order_index) WHERE is_docked = 1;

CREATE TABLE agentsam_widget_preferences (
  installation_id TEXT PRIMARY KEY REFERENCES agentsam_widget_installations(id) ON DELETE CASCADE,
  preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(preferences_json)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2) Suggested tiles in the Side Stage New tab = this account's browsing history.
--    No history store existed. title and icon_url are always written (host and origin
--    favicon as fallbacks), visit_count ranks, last_visited_at orders.
CREATE TABLE IF NOT EXISTS agentsam_browser_history (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1 CHECK (visit_count >= 1),
  last_visited_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, url)
);
CREATE INDEX IF NOT EXISTS idx_agentsam_browser_history_recent
  ON agentsam_browser_history(account_id, last_visited_at DESC);

-- 3) In-tab app work views: the standalone mount each editor app already ships.
UPDATE apps SET
  editor_url = CASE id
    WHEN 'cad-creator' THEN '/cad-creator/'
    WHEN 'samsketch' THEN '/samsketch/'
    WHEN 'design-canvas' THEN '/design-canvas/'
    WHEN 'moviemode' THEN '/moviemode/'
    WHEN 'ecommerce-cms-agentsam' THEN '/ecommerce-cms-agentsam/'
    WHEN 'database-editor' THEN '/database'
    WHEN 'goalguru' THEN '/goalguru'
  END,
  updated_at = unixepoch()
WHERE id IN ('cad-creator', 'samsketch', 'design-canvas', 'moviemode', 'ecommerce-cms-agentsam', 'database-editor', 'goalguru')
  AND editor_url IS NULL;
