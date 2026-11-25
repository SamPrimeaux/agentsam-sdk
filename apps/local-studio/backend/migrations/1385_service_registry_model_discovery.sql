-- agentsam-engine: d1
-- Service registry owns provider identity and discovery adapter selection.
-- Model IDs are always fetched from each account credential; never seed a model catalog.
CREATE TABLE IF NOT EXISTS agentsam_service_registry (
  service_name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE agentsam_service_registry
  ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE agentsam_service_registry
  ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE agentsam_service_registry
SET updated_at = unixepoch()
WHERE updated_at = 0;

-- Seed/upgrade provider metadata while preserving unrelated registry metadata.
INSERT INTO agentsam_service_registry
  (service_name, label, kind, created_at, metadata_json, updated_at)
VALUES
  ('openai', 'OpenAI', 'ai_provider', unixepoch(), json_object('provider_id','openai','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','openai')), unixepoch()),
  ('meta', 'Meta Model API', 'ai_provider', unixepoch(), json_object('provider_id','meta','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','meta')), unixepoch()),
  ('anthropic', 'Anthropic', 'ai_provider', unixepoch(), json_object('provider_id','anthropic','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','anthropic')), unixepoch()),
  ('gemini', 'Gemini', 'ai_provider', unixepoch(), json_object('provider_id','gemini','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','gemini')), unixepoch()),
  ('google', 'Google AI', 'ai_provider', unixepoch(), json_object('provider_id','gemini','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','gemini')), unixepoch()),
  ('xai', 'xAI / Grok', 'ai_provider', unixepoch(), json_object('provider_id','xai','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','xai')), unixepoch()),
  ('cursor', 'Cursor', 'ai_provider', unixepoch(), json_object('provider_id','cursor','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('true'),'adapter','cursor')), unixepoch()),
  ('meshy', 'Meshy', 'ai_provider', unixepoch(), json_object('provider_id','meshy','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('false'),'adapter','meshy')), unixepoch()),
  ('tavily', 'Tavily', 'ai_provider', unixepoch(), json_object('provider_id','tavily','credential_kind','provider_api_key','model_discovery',json_object('enabled',json('false'),'adapter','tavily')), unixepoch())
ON CONFLICT(service_name) DO UPDATE SET
  label = excluded.label,
  kind = excluded.kind,
  metadata_json = json_patch(
    CASE WHEN json_valid(agentsam_service_registry.metadata_json)
      THEN agentsam_service_registry.metadata_json ELSE '{}' END,
    excluded.metadata_json
  ),
  updated_at = unixepoch();

-- Model visibility belongs to the existing account UI preference document.
-- This is a compatibility-safe create for clean installs; existing rows survive.
CREATE TABLE IF NOT EXISTS agentsam_user_ui_preferences (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  ui_preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(ui_preferences_json)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
