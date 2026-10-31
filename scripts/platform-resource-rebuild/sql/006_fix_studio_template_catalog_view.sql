-- Point catalog view at canonical studio_templates after resource-rebuild cutover.
DROP VIEW IF EXISTS v_studio_template_catalog;
CREATE VIEW v_studio_template_catalog AS
  SELECT
    id,
    sku,
    app_id,
    pack_slug,
    pack_title,
    category,
    title,
    description,
    preview_r2_key AS preview_key,
    NULL AS thumbnail_url,
    status,
    sort_order,
    'platform' AS scope,
    NULL AS workspace_id,
    NULL AS tenant_id
  FROM studio_templates
  UNION ALL
  SELECT
    id,
    NULL,
    'moviemode',
    pack_slug,
    pack_title,
    template_kind,
    title,
    description,
    NULL,
    thumbnail_url,
    status,
    sort_order,
    scope,
    workspace_id,
    tenant_id
  FROM moviemode_templates;
