PRAGMA foreign_keys = ON;

-- TENANT: owns sites, content, billing. Platform > reseller > client via parent.
CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY
    DEFAULT ('acct_' || lower(hex(randomblob(8)))),
  slug              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  legal_name        TEXT,
  kind              TEXT NOT NULL DEFAULT 'organization',  -- manifest-validated
  parent_account_id TEXT REFERENCES accounts(id),
  root_account_id   TEXT REFERENCES accounts(id),          -- NULL = this is a root
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','suspended','closed')),
  plan_key          TEXT NOT NULL DEFAULT 'free',          -- manifest-validated
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  locale            TEXT NOT NULL DEFAULT 'en-US',
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_root   ON accounts(root_account_id);

-- PRINCIPAL: who or what acts (person, agent, service). No credentials.
CREATE TABLE IF NOT EXISTS principals (
  id            TEXT PRIMARY KEY
    DEFAULT ('prin_' || lower(hex(randomblob(8)))),
  kind          TEXT NOT NULL DEFAULT 'human',             -- human | agent | service
  email         TEXT,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  auth_provider TEXT,                                      -- whichever auth is installed
  auth_subject  TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','suspended','deleted')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (auth_provider, auth_subject)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_principals_email
  ON principals(lower(email)) WHERE email IS NOT NULL;

-- MEMBERSHIP: which principal has which role in which tenant.
CREATE TABLE IF NOT EXISTS account_members (
  account_id   TEXT NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'editor',             -- manifest-validated
  status       TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited','active','revoked')),
  invited_by   TEXT REFERENCES principals(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, principal_id)
);
CREATE INDEX IF NOT EXISTS idx_account_members_principal
  ON account_members(principal_id, status);

-- WHITE LABEL: hostname -> tenant resolution (storefront, admin, email).
CREATE TABLE IF NOT EXISTS account_domains (
  id                  TEXT PRIMARY KEY
    DEFAULT ('dom_' || lower(hex(randomblob(8)))),
  account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  hostname            TEXT NOT NULL UNIQUE,
  purpose             TEXT NOT NULL DEFAULT 'storefront',  -- storefront | admin | email
  is_primary          INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','failed')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_account_domains_account ON account_domains(account_id);

-- BRAND + CONFIG as data: brand.name, brand.logo_asset, brand.powered_by.visible, ...
CREATE TABLE IF NOT EXISTS account_settings (
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  value_json  TEXT NOT NULL DEFAULT 'null',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, setting_key)
);

-- PLAN LIMITS + FEATURE FLAGS as data: no schema change to add a feature.
CREATE TABLE IF NOT EXISTS account_entitlements (
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  value_json      TEXT NOT NULL DEFAULT 'true',
  source          TEXT NOT NULL DEFAULT 'plan',            -- plan | override
  expires_at      TEXT,
  PRIMARY KEY (account_id, entitlement_key)
);
