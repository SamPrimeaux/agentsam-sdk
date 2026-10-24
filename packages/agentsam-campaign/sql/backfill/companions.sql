-- Companions backfill; apply only against companionscpas D1, after core v1.
-- Fundraising financial transactions, donor records, emails and CMS assets retain
-- their existing authorities. No table is dropped or altered.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO campaign_scopes(id, owner_kind, owner_ref, display_name)
SELECT 'tenant:' || tenant_id, 'tenant', tenant_id, 'Companions tenant'
FROM fundraising_campaigns GROUP BY tenant_id;
INSERT OR IGNORE INTO campaign_scopes(id, owner_kind, owner_ref, display_name)
SELECT 'tenant:' || tenant_id, 'tenant', tenant_id, 'Companions tenant'
FROM email_campaigns GROUP BY tenant_id;

INSERT OR IGNORE INTO campaigns
  (id, scope_id, name, slug, kind, status, objective, brief, starts_at, ends_at,
   attributes_json, created_at, updated_at)
SELECT 'fundraising:' || id, 'tenant:' || tenant_id, title, slug,
  CASE WHEN campaign_type IN ('event','community') THEN campaign_type ELSE 'fundraising' END,
  CASE WHEN status IN ('draft','review','approved','scheduled','active','paused','completed','archived','failed')
    THEN status WHEN status='published' THEN 'active' ELSE 'draft' END,
  campaign_type, COALESCE(description,short_description), starts_at, ends_at,
  json_object('short_description', short_description,
              'goal_amount_cents_snapshot', goal_amount_cents,
              'raised_amount_cents_snapshot', raised_amount_cents,
              'donor_count_snapshot', donor_count,
              'original_campaign_type', campaign_type,
              'is_public_snapshot', is_public,
              'config', CASE WHEN json_valid(config_json) THEN json(config_json) ELSE json('{}') END),
  created_at, updated_at
FROM fundraising_campaigns;

INSERT OR IGNORE INTO campaign_source_links
  (id, scope_id, campaign_id, source_system, source_table, source_id, source_status)
SELECT 'source:fundraising:' || id, 'tenant:' || tenant_id, 'fundraising:' || id,
       'companions', 'fundraising_campaigns', id, status
FROM fundraising_campaigns;

-- Updates represent durable campaign materials, NOT proof that the web renderer deployed.
INSERT OR IGNORE INTO campaign_materials
  (id, scope_id, campaign_id, material_type, title, content_json, state,
   source_table, source_id, created_at, updated_at)
SELECT 'fundraising:update:' || u.id, 'tenant:' || u.tenant_id,
       'fundraising:' || u.campaign_id, 'update', u.title,
       json_object('body',u.body,'update_type',u.update_type,
                   'milestone_amount_cents',u.milestone_amount_cents,
                   'is_public',u.is_public,'published_at_original',u.published_at),
       CASE WHEN u.status='published' THEN 'published' ELSE 'draft' END,
       'campaign_updates', u.id, u.created_at, u.updated_at
FROM campaign_updates u
JOIN fundraising_campaigns f ON f.id=u.campaign_id AND f.tenant_id=u.tenant_id;

-- Media references point to customer CMS/R2 authority; never copy blobs or URLs.
INSERT OR IGNORE INTO campaign_asset_refs
  (id, scope_id, campaign_id, material_id, provider, external_asset_id, role)
SELECT 'companion:asset:' || a.id, 'tenant:' || a.tenant_id,
       'fundraising:' || a.campaign_id, NULL, 'companions.cms_assets', a.id,
       COALESCE(NULLIF(a.usage_type,''),'attachment')
FROM cms_assets a
JOIN fundraising_campaigns f ON f.id=a.campaign_id AND f.tenant_id=a.tenant_id
WHERE a.campaign_id IS NOT NULL;

INSERT OR IGNORE INTO campaign_asset_refs
  (id, scope_id, campaign_id, material_id, provider, external_asset_id, role)
SELECT 'companion:update-asset:' || a.id, 'tenant:' || a.tenant_id,
       'fundraising:' || u.campaign_id, 'fundraising:update:' || u.id,
       'companions.cms_assets', a.id, 'update'
FROM cms_assets a
JOIN campaign_updates u ON u.id=a.update_id AND u.tenant_id=a.tenant_id
JOIN fundraising_campaigns f ON f.id=u.campaign_id AND f.tenant_id=u.tenant_id
WHERE a.update_id IS NOT NULL;

-- Standalone email campaigns are campaigns of kind email. Do not falsely
-- attach them to fundraisers absent a verified relation.
INSERT OR IGNORE INTO campaigns
  (id,scope_id,name,slug,kind,status,objective,attributes_json,created_by,created_at,updated_at)
SELECT 'email:' || id, 'tenant:' || tenant_id,
       name, 'email-' || id, 'email',
       CASE WHEN status IN ('draft','review','approved','scheduled','active','paused','completed','archived','failed')
         THEN status WHEN status='sent' THEN 'completed' ELSE 'draft' END,
       'email', json_object('audience_type',audience_type,'scheduled_at',scheduled_at,'sent_at',sent_at),
       created_by, created_at, updated_at
FROM email_campaigns;

INSERT OR IGNORE INTO campaign_source_links
  (id,scope_id,campaign_id,source_system,source_table,source_id,source_status)
SELECT 'source:email:' || id, 'tenant:' || tenant_id,
       'email:' || id, 'companions','email_campaigns',id,status
FROM email_campaigns;

INSERT OR IGNORE INTO campaign_channels(id,scope_id,campaign_id,channel_key)
SELECT 'email:' || id || ':channel:email', 'tenant:' || tenant_id, 'email:' || id, 'email'
FROM email_campaigns;

INSERT OR IGNORE INTO campaign_materials
  (id,scope_id,campaign_id,material_type,channel_key,title,content_json,state,
   source_table,source_id,created_at,updated_at)
SELECT 'email:' || id || ':content', 'tenant:' || tenant_id, 'email:' || id,
       'email','email',subject,
       json_object('subject',subject,'body_html',body_html,'body_text',body_text),
       CASE WHEN status='sent' THEN 'published' ELSE 'draft' END,
       'email_campaigns',id,created_at,updated_at
FROM email_campaigns;

-- Donation totals/donor identities stay in donations and fundraising_campaigns.
-- A publication receipt is created only by a VERIFIED execution API.
