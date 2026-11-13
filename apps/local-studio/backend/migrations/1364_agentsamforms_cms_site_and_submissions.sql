-- agentsam-engine: d1
-- Merchant-installable AgentSamForms, using the canonical Apps catalog and CMS site globals.
-- Form documents live in cms_globals; only submissions need an operational table.
INSERT OR IGNORE INTO apps
(id,name,slug,description,category,status,featured,created_at,updated_at,app_type,visibility,launch_url,editor_url,capabilities_json,config_json)
VALUES
('agentsamforms','AgentSamForms','agentsamforms',
'Build, publish and embed storefront forms, with account-owned responses.',
'forms','active',0,unixepoch(),unixepoch(),'application','public','/forms','/forms',
json_object('forms',json_array('create','edit','publish','submissions')),
json_object('site_scoped',true,'surface','merchant-storefront'));

CREATE TABLE IF NOT EXISTS cms_form_submissions (
  id TEXT PRIMARY KEY DEFAULT ('fsub_' || lower(hex(randomblob(12)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  form_id TEXT NOT NULL REFERENCES cms_globals(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json)='object'),
  is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cms_form_submissions_account_site_form
 ON cms_form_submissions(account_id,site_id,form_id,created_at DESC);

-- Do not permit an account/site mismatch even when a client supplies a real form ID.
CREATE TRIGGER IF NOT EXISTS trg_cms_form_submission_scope
 BEFORE INSERT ON cms_form_submissions
 BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_globals g WHERE g.id=NEW.form_id
      AND g.account_id=NEW.account_id AND g.site_id=NEW.site_id
      AND g.global_type='form' AND g.global_key LIKE 'form:%'
  ) THEN RAISE(ABORT,'cms_form_scope_mismatch') END;
 END;
