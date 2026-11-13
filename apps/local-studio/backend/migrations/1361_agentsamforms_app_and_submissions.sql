-- agentsam-engine: d1
-- AgentSamForms native installable application and owner-scoped, testable data.
-- Installations are account-owned through agentsam_plugin_installations.
-- This migration registers the app but does NOT auto-install or seed accounts.
CREATE TABLE IF NOT EXISTS agentsam_forms (
  id TEXT PRIMARY KEY DEFAULT ('frm_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  document_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(document_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,
  UNIQUE(account_id, key)
);
CREATE INDEX IF NOT EXISTS agentsam_forms_account_status
  ON agentsam_forms(account_id, status, updated_at);
CREATE TABLE IF NOT EXISTS agentsam_form_submissions (
  id TEXT PRIMARY KEY DEFAULT ('fsub_' || lower(hex(randomblob(12)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES agentsam_forms(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS agentsam_form_submissions_owner
  ON agentsam_form_submissions(account_id,form_id,created_at DESC);

-- The account's Apps picker is the only installation authority; no
-- automatic installation for future accounts and no duplicate form registry.
INSERT OR IGNORE INTO agentsam_plugins (
  plugin_key,family_key,provider_key,plugin_kind,category,display_name,description,
  transport,auth_type,capabilities_json,metadata_json,
  composer_visible,settings_visible,sort_priority,health_strategy
) VALUES (
  'agentsam-app-forms','commerce','agentsam','native','Forms','AgentSamForms',
  'Build, publish, embed, and manage site forms with real stored submissions.',
  'native','none','["forms.read","forms.create","forms.edit","forms.publish","forms.submissions"]',
  json_object(
    'source','https://agentsam.inneranimalmedia.com/catalog/plugins',
    'app',json_object(
      'nav',json_object('href','/forms','label','AgentSamForms','icon','clipboard-list'),
      'surfaces',json_array('admin-nav'),
      'skills',json_array()
    )
  ),
  0,1,49,'none'
);
