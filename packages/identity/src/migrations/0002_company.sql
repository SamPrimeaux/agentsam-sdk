-- Add company table for existing identity scaffolds (safe to re-run).
CREATE TABLE IF NOT EXISTS company (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  auth_bg_color TEXT,
  support_email TEXT,
  website_url TEXT,
  tagline TEXT,
  meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_slug ON company(slug);
