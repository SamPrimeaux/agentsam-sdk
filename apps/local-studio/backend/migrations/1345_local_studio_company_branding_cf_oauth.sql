-- agentsam-engine: d1
-- Local Studio portal branding in D1 `company` (SSOT for /api/company via meta.hosts).
-- Targets the deployed business D1 (SQLite dialect: unixepoch()) — Postgres appliers skip it.
-- Logo = composed macOS app icon (same master as the downloadable .app / Finder icon).

INSERT INTO company (
  id, slug, name, legal_name, logo_url, favicon_url,
  primary_color, auth_bg_color, support_email, website_url, tagline, meta_json,
  created_at, updated_at
) VALUES (
  'co_agentsam',
  'agentsam',
  'AgentSam Local Studio',
  'Inner Animals LLC',
  'https://agentsam.inneranimalmedia.com/shared/app-icon.png',
  'https://agentsam.inneranimalmedia.com/shared/app-icon.png',
  '#3AA8F8',
  '#050508',
  'hey@inneranimalmedia.com',
  'https://agentsam.inneranimalmedia.com',
  'AgentSam',
  '{"privacyUrl":"/privacy","termsUrl":"/terms","contactUrl":"/contact","platform":"agentsam","portal":"local-studio","hosts":["agentsam.inneranimalmedia.com"]}',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  name = excluded.name,
  legal_name = excluded.legal_name,
  logo_url = excluded.logo_url,
  favicon_url = excluded.favicon_url,
  primary_color = excluded.primary_color,
  auth_bg_color = excluded.auth_bg_color,
  support_email = excluded.support_email,
  website_url = excluded.website_url,
  tagline = excluded.tagline,
  meta_json = excluded.meta_json,
  updated_at = excluded.updated_at;

UPDATE oauth_providers
SET
  is_enabled = 1,
  scopes = '["account-settings.read","user-details.read","memberships.read","offline_access"]',
  redirect_uris = '["https://agentsam.inneranimalmedia.com/api/oauth/cloudflare/callback","https://agentsam.inneranimalmedia.com/api/connections/cloudflare/callback","https://inneranimalmedia.com/api/oauth/cloudflare/callback"]',
  auth_url = 'https://dash.cloudflare.com/oauth2/auth',
  token_url = 'https://dash.cloudflare.com/oauth2/token',
  user_info_url = 'https://api.cloudflare.com/client/v4/user',
  updated_at = unixepoch()
WHERE id = 'cloudflare';
