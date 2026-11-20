-- agentsam-engine: d1
-- One installed CMS application, one canonical merchant entry point.
-- Keep the app catalog and account installations; only update its launcher.
UPDATE apps
   SET launch_url = '/admin/store', updated_at = unixepoch()
 WHERE id = 'ecommerce-cms-agentsam'
   AND launch_url IN ('/apps/ecommerce-cms-agentsam', '/admin/apps/ecommerce-cms-agentsam');
