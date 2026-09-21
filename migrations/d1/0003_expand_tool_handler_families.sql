-- Native provider families are carried by handler_key so this migration is
-- safe for the existing agentsam_tools CHECK constraint (`cms` is the
-- ecommerce native family). This registry lets dispatchers discover provider
-- identity without rebuilding a table referenced by legacy views.
CREATE TABLE IF NOT EXISTS agentsam_tool_handler_families (
  handler_family TEXT PRIMARY KEY,
  handler_type TEXT NOT NULL,
  dispatch_target TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR REPLACE INTO agentsam_tool_handler_families
  (handler_family, handler_type, dispatch_target, description, updated_at)
VALUES
  ('ecommerce-cms-agentsam.completeful', 'cms', 'native', 'Completeful curated ecommerce capabilities.', unixepoch()),
  ('project.vectorize', 'vectorize', 'native', 'Project-declared Vectorize binding/index/model lane.', unixepoch());
