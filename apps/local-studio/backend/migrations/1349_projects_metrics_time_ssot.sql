-- Canonical projects.id is TEXT; the historical 8 project_metrics rows
-- are retained intact for review rather than silently merged with measured time.
ALTER TABLE project_metrics RENAME TO project_metrics_legacy_20261028;
CREATE TABLE project_metrics (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  total_hours REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  api_tokens_used INTEGER NOT NULL DEFAULT 0,
  time_entry_count INTEGER NOT NULL DEFAULT 0,
  cost_entry_count INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  legacy_hours REAL,
  legacy_cost REAL,
  legacy_tokens INTEGER,
  measurement_status TEXT NOT NULL DEFAULT 'unmeasured'
    CHECK (measurement_status IN ('unmeasured','measured','legacy_unverified'))
);
INSERT INTO project_metrics (project_id,legacy_hours,legacy_cost,legacy_tokens,measurement_status)
SELECT CAST(m.project_id AS TEXT), SUM(m.total_hours), SUM(m.total_cost),
       SUM(m.api_tokens_used), 'legacy_unverified'
FROM project_metrics_legacy_20261028 m
WHERE EXISTS (SELECT 1 FROM projects p WHERE p.id = CAST(m.project_id AS TEXT))
GROUP BY CAST(m.project_id AS TEXT);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_verified
 ON time_entries(project_id, user_id, source, ended_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_active_work_timer
 ON time_entries(user_id, project_id)
 WHERE source='work_timer' AND ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_costs_project_key ON project_costs(project_id);
