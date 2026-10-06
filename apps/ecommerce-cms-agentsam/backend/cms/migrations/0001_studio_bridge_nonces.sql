-- Apply once to the FNF D1 before enabling Studio CMS bridge writes.
-- No media, page, session, or published HTML changes.
CREATE TABLE IF NOT EXISTS cms_studio_bridge_nonces (
  nonce TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cms_studio_bridge_nonces_created
  ON cms_studio_bridge_nonces(created_at);
