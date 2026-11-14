-- agentsam-engine: d1
-- Complete the public `apps` catalog with every installable app the SDK ships
-- (agentsam.app.json manifests) so the Apps launcher and the Side Stage App
-- library list the full assortment. Idempotent; already applied to production.
INSERT INTO apps (id, name, slug, description, category, status, featured, created_at, updated_at, app_icon, app_type, visibility, launch_url)
VALUES
  ('database-editor', 'Database Editor', 'database-editor', 'Browse, query and edit your databases, with vector and metrics views.', 'data', 'active', 0, unixepoch(), unixepoch(), 'database', 'application', 'public', '/database'),
  ('goalguru', 'GoalGuru', 'goalguru', 'Goals and ticket-linked plans you can follow from start to finish.', 'productivity', 'active', 0, unixepoch(), unixepoch(), 'goalguru', 'application', 'public', '/goalguru'),
  ('ecommerce-cms-agentsam', 'Ecommerce + CMS', 'ecommerce-cms-agentsam', 'Products, inventory, theme editing, media and analytics for your storefront.', 'commerce', 'active', 0, unixepoch(), unixepoch(), 'cms', 'application', 'public', '/apps/ecommerce-cms-agentsam')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  app_icon = excluded.app_icon, app_type = excluded.app_type, visibility = excluded.visibility,
  launch_url = excluded.launch_url, status = 'active', updated_at = unixepoch();

-- Give the existing catalog entries their symbol key (only where none is set).
UPDATE apps SET
  app_icon = CASE id
    WHEN 'cad-creator' THEN 'cad' WHEN 'moviemode' THEN 'moviemode' WHEN 'samsketch' THEN 'samsketch'
    WHEN 'growth' THEN 'growth' WHEN 'design-canvas' THEN 'canvas' WHEN 'agentsamforms' THEN 'forms' END,
  updated_at = unixepoch()
WHERE app_icon IS NULL AND app_type = 'application' AND visibility = 'public'
  AND id IN ('cad-creator', 'moviemode', 'samsketch', 'growth', 'design-canvas', 'agentsamforms');
