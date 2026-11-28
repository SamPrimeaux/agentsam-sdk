-- PrimeTech is a first-class endorsed brand in the existing shared registry.
-- Keep the stable id referenced by the account-owned brand_asset records.
-- The brand_asset and brand_asset_variant tables remain the asset authorities;
-- this migration only guarantees the canonical identity row exists.
INSERT OR IGNORE INTO brands (
  id,
  parent_brand_id,
  name,
  slug,
  display_name,
  tagline,
  description,
  architecture_model,
  status,
  priority,
  tags,
  timezone,
  service_tier,
  is_public,
  requires_oauth
) VALUES (
  'brand_primetech',
  'brand_inneranimal',
  'PrimeTech',
  'primetech',
  'PrimeTech',
  'Creative production systems',
  'Creative design, media, spatial, CAD, and engineering production systems.',
  'endorsed_brand',
  'active',
  5,
  '["creative","production"]',
  'America/Chicago',
  'family',
  0,
  1
);
