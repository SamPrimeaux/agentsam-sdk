SELECT slug,kind,status,canonical_path,package_name,
       json_extract(metadata,'$.app_id') AS app_id,
       json_extract(metadata,'$.legacy_slug') AS legacy_slug,
       json_extract(metadata,'$.dispatch') AS dispatch
FROM agentsam_products
WHERE slug IN (
  'cms',
  'client-cms-editor',
  'theme-inneranimals-site',
  'asrust',
  'agentsam-machine',
  'agentsam-rapid-rust'
)
ORDER BY slug;

SELECT p.slug AS source_slug,
       ar.relationship_type,
       CASE WHEN ar.target_type='agentsam_product' THEN tp.slug ELSE ar.target_id END AS target,
       ar.target_type
FROM asset_relationships ar
JOIN agentsam_products p
  ON ar.source_type='agentsam_product' AND ar.source_id=p.id
LEFT JOIN agentsam_products tp
  ON ar.target_type='agentsam_product' AND ar.target_id=tp.id
WHERE p.slug IN ('cms','iam-client-cms-editor','theme-inneranimals-site','agentsam-rapid-rust')
  AND ar.relationship_type IN ('packaged_as','aliased_as','depends_on','exposes_command')
ORDER BY source_slug, ar.relationship_type, target;
