-- Batch 1 / phase A: non-disruptive production staging.
-- This is deliberately NOT the final agentsam_commands cutover.
-- A TEMP table disappears when the D1 session ends, so the original
-- workspace-scoped command records are snapshotted in a persistent table.
-- Run only against the authorized platform D1 after the source and count gates.
-- Preserve command runs / slash consumers until a separate cutover is proven.
CREATE TABLE IF NOT EXISTS agentsam_commands_legacy_snapshot_20261123
  AS SELECT * FROM agentsam_commands WHERE 0;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_agentsam_commands_legacy_snapshot_20261123_id
  ON agentsam_commands_legacy_snapshot_20261123(id);

INSERT OR IGNORE INTO agentsam_commands_legacy_snapshot_20261123
  SELECT * FROM agentsam_commands;

-- Distribution-aware, versioned candidate catalog.
-- The package version here is the SOURCE version, not proof of npm/PyPI upload.
-- Never publish/display a row unless release_state is 'verified' AND the
-- recorded artifact digest and CLI invocation have passed release verification.
CREATE TABLE IF NOT EXISTS agentsam_commands_next (
  id TEXT PRIMARY KEY,
  package_manager TEXT NOT NULL CHECK(package_manager IN ('npm','pip')),
  package_name TEXT NOT NULL,
  package_version TEXT NOT NULL,
  executable TEXT NOT NULL,
  command_key TEXT NOT NULL,
  command_words_json TEXT NOT NULL CHECK(json_valid(command_words_json)),
  aliases_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases_json)),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  release_state TEXT NOT NULL DEFAULT 'source_only'
    CHECK(release_state IN ('source_only','verified','withdrawn')),
  verification_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(verification_json)),
  verified_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(package_manager,package_name,package_version,executable,command_key),
  CHECK(release_state!='verified' OR (verified_at IS NOT NULL AND is_active=1)),
  CHECK(is_active=0 OR release_state='verified')
);

CREATE INDEX IF NOT EXISTS idx_agentsam_commands_next_visible
  ON agentsam_commands_next(package_manager,package_name,release_state,is_active);
CREATE INDEX IF NOT EXISTS idx_agentsam_commands_next_source
  ON agentsam_commands_next(source_path,source_sha256);

-- Safe discovery while the legacy commands table is still in service.
CREATE VIEW IF NOT EXISTS agentsam_commands_published AS
  SELECT id, package_manager,package_name,package_version,executable,
         command_key,command_words_json,aliases_json,display_name,
         description,topic,source_path,source_sha256,verification_json
  FROM agentsam_commands_next
  WHERE release_state='verified' AND is_active=1;
