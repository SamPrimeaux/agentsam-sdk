-- Provider/model working-set policy is runtime configuration, not prompt text.
-- Apps may seed this from their provider catalog; the SDK remains provider-neutral.
CREATE TABLE IF NOT EXISTS agentsam_model_policies (
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  target_input_tokens INTEGER,
  compact_at_tokens INTEGER,
  intervene_at_tokens INTEGER,
  max_normal_input_tokens INTEGER,
  pricing_threshold_tokens INTEGER,
  max_cumulative_input_tokens INTEGER,
  safety_margin_tokens INTEGER,
  compaction_strategy TEXT NOT NULL DEFAULT 'provider_or_runtime'
    CHECK (compaction_strategy IN ('provider_or_runtime','provider_native','runtime_summary','none')),
  policy_source TEXT NOT NULL DEFAULT 'application'
    CHECK (policy_source IN ('application','provider','catalog','operator')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (provider, model_key)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_model_policies_active
  ON agentsam_model_policies(provider, is_active);
