-- agentsam-engine: d1
-- Register only verified, package-declared screens in the existing app catalog.
-- Account installations can further narrow this list with runtime.screen_ids or
-- runtime.disabled_screen_ids in agentsam_app_installations.config_json.

UPDATE apps
SET config_json = json_patch(
  CASE
    WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json
    ELSE '{}'
  END,
  json_object('runtime', json_object(
    'manifest_id', 'ecommerce-cms-agentsam',
    'screen_ids', json_array(
      'ecommerce-cms-agentsam.store',
      'ecommerce-cms-agentsam.pages',
      'ecommerce-cms-agentsam.structure',
      'ecommerce-cms-agentsam.preferences',
      'ecommerce-cms-agentsam.products',
      'ecommerce-cms-agentsam.collections',
      'ecommerce-cms-agentsam.product-create',
      'ecommerce-cms-agentsam.inventory',
      'ecommerce-cms-agentsam.orders',
      'ecommerce-cms-agentsam.discounts',
      'ecommerce-cms-agentsam.audience'
    )
  ))
)
WHERE id = 'ecommerce-cms-agentsam';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'ecommerce-cms-agentsam', 'screen_ids', json_array('agentsamforms.page')))
)
WHERE id = 'agentsamforms';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'local-studio', 'screen_ids', json_array('database-editor.workspace')))
)
WHERE id = 'database-editor';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'cad-creator', 'screen_ids', json_array('cad-creator.workspace')))
)
WHERE id = 'cad-creator';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'design-canvas', 'screen_ids', json_array('design-canvas.editor')))
)
WHERE id = 'design-canvas';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'goalguru', 'screen_ids', json_array('goalguru.workspace')))
)
WHERE id = 'goalguru';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'moviemode', 'screen_ids', json_array('moviemode.editor')))
)
WHERE id = 'moviemode';

UPDATE apps
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object('manifest_id', 'samsketch', 'screen_ids', json_array('samsketch.studio')))
)
WHERE id = 'samsketch';

