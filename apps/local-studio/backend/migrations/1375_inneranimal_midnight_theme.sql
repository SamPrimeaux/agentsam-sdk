-- agentsam-engine: d1
-- Rename the account appearance preset in place. Preserve the theme id,
-- existing selections, and its exact color/motion tokens.
UPDATE cms_themes
SET name = 'InnerAnimal Midnight',
    slug = 'inneranimal-midnight',
    tags_json = '["dark","inneranimal","midnight"]',
    updated_at = datetime('now')
WHERE id = 'theme-muse-dark'
  AND (name != 'InnerAnimal Midnight'
    OR slug != 'inneranimal-midnight'
    OR tags_json != '["dark","inneranimal","midnight"]');

UPDATE cms_theme_preferences
SET theme_slug = 'inneranimal-midnight', updated_at = datetime('now')
WHERE theme_id = 'theme-muse-dark' AND theme_slug = 'muse-dark';
