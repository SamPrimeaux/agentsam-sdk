-- Apply explicitly with `agentsam index setup-store`; never on init or search.
-- Use a dedicated backend database role. Do not expose this schema via PostgREST.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS agentsam_knowledge;
SET search_path = agentsam_knowledge, public, extensions;
CREATE TABLE IF NOT EXISTS agentsam_knowledge.cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  embedding vector
);
CREATE TABLE IF NOT EXISTS agentsam_knowledge.generations (
  id text PRIMARY KEY,
  scope text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_history ON agentsam_knowledge.generations(scope, created_at);
CREATE TABLE IF NOT EXISTS agentsam_knowledge.active (
  scope text PRIMARY KEY,
  id text NOT NULL REFERENCES agentsam_knowledge.generations(id)
);
CREATE TABLE IF NOT EXISTS agentsam_knowledge.observations (
  id text PRIMARY KEY,
  namespace text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
REVOKE ALL ON SCHEMA agentsam_knowledge FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA agentsam_knowledge FROM PUBLIC;
