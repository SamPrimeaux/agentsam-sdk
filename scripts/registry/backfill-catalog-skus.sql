-- Idempotent legacy SKU backfill for agentsam_products.
-- Applied to inneranimalmedia-business production 2026-10-31.
-- Do not modify existing SKU assignments or canonical product IDs.
-- This is an INTERNAL catalog reference, not a billable offer or provider SKU.
UPDATE agentsam_products
SET sku='IA-' || CASE kind
  WHEN 'app' THEN 'APP'
  WHEN 'sdk-package' THEN 'SDK'
  WHEN 'integration' THEN 'INT'
  WHEN 'theme' THEN 'THM'
  WHEN 'section' THEN 'SEC'
  WHEN 'block' THEN 'BLK'
  WHEN 'ui-component' THEN 'CMP'
  WHEN 'script' THEN 'SCR'
  WHEN 'service' THEN 'SVC'
  WHEN 'solution' THEN 'SOL'
  WHEN 'product' THEN 'PRD'
  WHEN 'collection' THEN 'COL'
  WHEN 'product-line' THEN 'LINE'
  ELSE 'UNCLASSIFIED'
END || '-' || UPPER(REPLACE(slug,'_','-'))
WHERE sku IS NULL OR TRIM(sku)='';
