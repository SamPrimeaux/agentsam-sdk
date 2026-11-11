-- Identity sign-in integrations are SDK package capabilities, not separate OAuth apps.
-- Reconcile catalog metadata to the actual reusable package and preserve internal
-- visibility until installation and artifact-release receipts are verified.
UPDATE agentsam_products
SET package_name = '@inneranimalmedia/agentsam-identity',
    version = '2.6.14',
    updated_at = unixepoch()
WHERE slug IN (
  'identity-signin-inneranimalmedia',
  'identity-signin-google',
  'identity-signin-cloudflare',
  'identity-signin-chatgpt'
)
  AND package_name = '@inneranimalmedia/agentsam-sdk-identity'
  AND catalog_visibility = 'internal';

INSERT INTO agentsam_products (
  id, slug, name, kind, status, description,
  canonical_path, package_name, version, tags, metadata, catalog_visibility
) VALUES (
  'prod_signin_github',
  'identity-signin-github',
  'Sign in with GitHub',
  'integration',
  'wired',
  'Reusable GitHub OAuth sign-in provider from the shared AgentSam Identity package.',
  'packages/identity/src/providers/github',
  '@inneranimalmedia/agentsam-identity',
  '2.6.14',
  '["identity","oauth","github","sign-in"]',
  '{"provider_id":"github","scope":"site","implementation":"packages/identity/src/providers/github","release_gate":"verified_site_install"}',
  'internal'
)
ON CONFLICT(slug) DO NOTHING;
