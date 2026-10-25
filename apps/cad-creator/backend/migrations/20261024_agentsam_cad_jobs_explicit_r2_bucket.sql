-- agentsam_cad_jobs.r2_bucket: remove the hardcoded default.
-- New jobs must name their destination bucket explicitly (NULL = not yet chosen).
-- Existing rows keep their recorded bucket, because their artifacts are stored there.
-- SQLite cannot alter a column default in place, so the column is rebuilt in four steps.
ALTER TABLE agentsam_cad_jobs ADD COLUMN r2_bucket_explicit TEXT
  CHECK (r2_bucket_explicit IS NULL OR length(trim(r2_bucket_explicit)) > 0);
UPDATE agentsam_cad_jobs SET r2_bucket_explicit = r2_bucket;
ALTER TABLE agentsam_cad_jobs DROP COLUMN r2_bucket;
ALTER TABLE agentsam_cad_jobs RENAME COLUMN r2_bucket_explicit TO r2_bucket;
