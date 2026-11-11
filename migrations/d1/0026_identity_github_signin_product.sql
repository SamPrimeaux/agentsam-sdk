-- Canonical product registration for the existing packaged GitHub OAuth sign-in.
-- This is catalog metadata only: it does NOT grant credentials, permissions, or site installs.
-- It stays internal until the site-scoped install and published release gates pass.
INSERT INTO agentsam_products (
  id, slug, name, kind, status, description,
  canonical_path, package_name, version, tags, metadata, catalog_visibility
)
VALUES (
  'prod_signin_github',
  'identity-signin-github',
  'Sign in with GitHub',
  'integration',
  'wired',
  'Reusable GitHub OAuth sign-in provider from the shared AgentSam Identity package.',
  'packages/identity/src/providers/github',
  '@inneranimalmedia/agentsam-sdk-identity',
  '2.6.14',
  '["identity","oauth","github","sign-in"]',
  '{"provider_id":"github","account_scope":"site","implementation":"packages/identity/src/providers/github","release_gate":"verified_site_install"}',
  'internal'
)
ON CONFLICT(slug) DO NOTHING;
