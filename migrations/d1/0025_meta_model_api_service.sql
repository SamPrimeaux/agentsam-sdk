-- Register Meta Model API in the existing account-owned BYOK service registry.
-- This row does not grant account access, create credentials, or select a plan.
INSERT INTO agentsam_service_registry (service_name, label, kind, created_at)
VALUES ('meta', 'Meta Model API', 'ai_provider', unixepoch())
ON CONFLICT(service_name) DO UPDATE SET
  label = excluded.label,
  kind = excluded.kind;
