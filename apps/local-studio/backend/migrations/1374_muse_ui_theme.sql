-- agentsam-engine: d1
-- Selectable account appearance preset. No storefront or account selection writes.
INSERT INTO cms_themes (
  id, name, slug, config, theme_family, sort_order, monaco_theme, monaco_bg,
  tokens_json, css_vars_json, layout_json, typography_json, motion_json,
  status, visibility, tags_json, created_at_unix, updated_at
) VALUES (
  'theme-muse-dark', 'Muse Dark', 'muse-dark', '{}', 'dark', 45, 'vs-dark', '#111113',
  '{"page":"#111113","card":"#1E1E20","input":"#2C2C2E","line":"#2E2E30","ink":"#F5F5F7","muted":"#A1A1A6","primary":"#0A84FF"}',
  '{"--bg-canvas":"#111113","--bg-app":"#111113","--bg-rail":"#0B0B0C","--bg-sidebar":"#171719","--bg-topbar":"#0B0B0C","--bg-surface":"#1E1E20","--bg-panel":"#1E1E20","--bg-elevated":"#2A2A2D","--bg-hover":"#2A2A2D","--bg-input":"#2C2C2E","--bg-search":"#2C2C2E","--bubble-assistant":"#262628","--bubble-user":"#0A84FF","--accent":"#0A84FF","--color-primary":"#0A84FF","--accent-hover":"#409CFF","--text-main":"#F5F5F7","--text-primary":"#F5F5F7","--text-secondary":"#A1A1A6","--text-tertiary":"#7A7A80","--border":"#2E2E30","--success":"#30D158","--danger":"#FF453A","--accent-danger":"#FF453A","--warning":"#FF9F0A","--soul":"#E0332E","--memory":"#3A7BD5","--radius-bubble":"20px","--radius-card":"16px","--radius-pill":"999px"}',
  '{"radii":[{"label":"Bubble","value":20},{"label":"Card","value":16},{"label":"Pill","value":999}],"railWidth":60,"sidebarWidth":248,"inspectorWidth":360}',
  '{"family":"system-ui","scale":[{"role":"body","label":"Chat body","size":15,"line":22,"weight":400}]}',
  '{"workBorder":{"state":"working","width":2,"duration":"4s","stops":["#0A84FF","#409CFF","#7DD3FC","#BF5AF2"]},"respectsReducedMotion":true}',
  'active', 'public', '["dark","muse"]', unixepoch(), datetime('now')
) ON CONFLICT(slug) DO NOTHING;
