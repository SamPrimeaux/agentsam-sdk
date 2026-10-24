-- FNF read-through seed migration; run only against fuelnfreetime D1.
-- Requires 0001_campaign_core.sql. Does not mutate legacy tables.
-- Re-running is safe: INSERT OR IGNORE retains canonical edits after the first import.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO campaign_scopes(id, owner_kind, owner_ref, display_name)
SELECT 'account:' || account_id, 'account', account_id, 'Ecommerce account'
FROM growth_campaigns GROUP BY account_id;

INSERT OR IGNORE INTO campaigns (
  id, scope_id, name, slug, kind, status, objective, audience, brief,
  approval_mode, starts_at, ends_at, attributes_json, created_by, updated_by, created_at, updated_at
)
SELECT
  'growth:' || g.id, 'account:' || g.account_id,
  COALESCE(NULLIF(trim(g.name), ''), g.id), g.slug, 'marketing',
  CASE WHEN g.status IN ('draft','generating','review','approved','scheduled','active','paused','completed','archived','failed')
    THEN g.status ELSE 'draft' END,
  g.goal, g.audience, g.brief, COALESCE(g.approval_mode, 'manual'),
  g.start_date, g.end_date,
  json_object('priority', g.priority, 'primary_source', g.primary_source,
              'legacy_metadata', CASE WHEN json_valid(g.metadata_json) THEN json(g.metadata_json) ELSE json('{}') END),
  g.created_by, g.updated_by, g.created_at, g.updated_at
FROM growth_campaigns g;

INSERT OR IGNORE INTO campaign_source_links
  (id, scope_id, campaign_id, source_system, source_table, source_id, source_status)
SELECT 'source:growth:' || g.id, 'account:' || g.account_id,
       'growth:' || g.id, 'ecommerce', 'growth_campaigns', g.id, g.status
FROM growth_campaigns g;

INSERT OR IGNORE INTO campaign_channels (id, scope_id, campaign_id, channel_key)
SELECT 'growth:' || g.id || ':channel:' || j.value,
       'account:' || g.account_id, 'growth:' || g.id, j.value
FROM growth_campaigns g,
  json_each(CASE WHEN json_valid(g.channels_json)
                 THEN CASE WHEN json_type(g.channels_json)='array' THEN g.channels_json ELSE '[]' END
                 ELSE '[]' END) j
WHERE j.type='text' AND trim(j.value) != '';

-- Original generated packs remain inspectable; provenance is in source links.
INSERT OR IGNORE INTO campaign_materials
  (id, scope_id, campaign_id, material_type, title, content_json, state,
   source_table, source_id, created_at, updated_at)
SELECT 'growth:' || g.id || ':pack', 'account:' || g.account_id,
       'growth:' || g.id, 'pack', g.name,
       g.pack_json, CASE WHEN g.status IN ('review','approved','active','paused','completed') THEN 'review' ELSE 'draft' END,
       'growth_campaigns.pack_json', g.id, g.created_at, g.updated_at
FROM growth_campaigns g
WHERE json_valid(g.pack_json) AND json_type(g.pack_json)='object' AND g.pack_json != '{}';

-- Only positive stored aggregates become legacy snapshots, never first-party
-- measured truths and never fabricated zeroes.
INSERT OR IGNORE INTO campaign_metric_facts
  (id, scope_id, campaign_id, metric_key, value_num, unit, evidence_kind,
   source_system, source_ref, measured_at)
SELECT 'growth:' || id || ':sessions', 'account:' || account_id, 'growth:' || id,
       'sessions', session_count, 'count', 'legacy_snapshot',
       'growth_campaigns', id, updated_at
FROM growth_campaigns WHERE session_count > 0;

INSERT OR IGNORE INTO campaign_metric_facts
  (id, scope_id, campaign_id, metric_key, value_num, unit, evidence_kind,
   source_system, source_ref, measured_at)
SELECT 'growth:' || id || ':attributed-revenue', 'account:' || account_id, 'growth:' || id,
       'attributed_revenue', attributed_revenue_cents, 'usd_cents', 'legacy_snapshot',
       'growth_campaigns', id, updated_at
FROM growth_campaigns WHERE attributed_revenue_cents > 0;

-- Revenue/orders attribution_visits remain native sources; don't copy PII or guess joins.
