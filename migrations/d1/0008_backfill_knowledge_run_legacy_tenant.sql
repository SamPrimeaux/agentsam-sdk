-- Complete the portable identity backfill for runs whose historical row did
-- not carry tenant_id but whose legacy active generation did.
UPDATE agentsam_knowledge_runs
SET account_id = 'legacy:' || (
  SELECT tenant_id FROM agentsam_knowledge_generation generation
  WHERE generation.legacy_workspace_id = agentsam_knowledge_runs.workspace_id
)
WHERE account_id = 'legacy:unknown'
  AND EXISTS (
    SELECT 1 FROM agentsam_knowledge_generation generation
    WHERE generation.legacy_workspace_id = agentsam_knowledge_runs.workspace_id
      AND generation.tenant_id IS NOT NULL
      AND generation.tenant_id <> ''
  );
