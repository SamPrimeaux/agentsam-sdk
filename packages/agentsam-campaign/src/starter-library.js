/**
 * AgentSam Campaign — reusable Increase Sales starter library.
 * Owns the definitions and prepares drafts for the canonical campaign store.
 * It never writes CMS content, sends messages or accepts client-supplied scope.
 */
import { starterCampaigns, catalogMeta, campaignById } from '../starter-packs/increase-sales/v1/src/catalog.mjs';

export { starterCampaigns, catalogMeta, campaignById };

export const CAMPAIGN_STARTER_SCHEMA = 'agentsam.campaign.starter-library/v1';

const CREATIVE_CHANNELS = Object.freeze({
  website: 'homepage_banner',
  email: 'email',
  social: 'social',
  product_card: 'product_pages',
  sms: 'sms',
  paid_ad: 'retargeting',
});

function allowedString(value, field, limit = 20000) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > limit) throw new Error('invalid_campaign_' + field);
  return value.trim();
}

/**
 * Return a D1 createCampaignStore(...).create input (NOT a published campaign).
 * Caller must still resolve account/site ownership and validate all referenced
 * products, audience segments, offers, destinations and provider capabilities.
 */
export function prepareCampaignFromStarter(templateId, input = {}) {
  const template = campaignById(templateId);
  if (!template) throw new Error('campaign_starter_not_found');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_campaign_starter_input');
  const name = allowedString(input.name, 'name', 180);
  if (!name) throw new Error('campaign_name_required');
  const slug = allowedString(input.slug, 'slug', 180);
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('invalid_campaign_slug');
  const audience = allowedString(input.audience, 'audience', 512);
  const brief = allowedString(input.brief, 'brief') || template.summary;
  const starts_at = allowedString(input.starts_at, 'starts_at', 64);
  const ends_at = allowedString(input.ends_at, 'ends_at', 64);
  if (starts_at && ends_at && !(Date.parse(starts_at) < Date.parse(ends_at))) throw new Error('invalid_campaign_schedule');
  return Object.freeze({
    name,
    slug,
    kind: 'marketing',
    objective: 'increase_sales',
    audience,
    brief,
    approval_mode: 'manual',
    starts_at,
    ends_at,
    attributes: {
      starter: { key: template.id, version: template.template_version, library: CAMPAIGN_STARTER_SCHEMA },
      proposed_channels: [...template.channel_defaults],
      required_checks: [...template.required_checks],
      preview_only: true,
    },
  });
}

/** Return draft material payloads for the canonical campaign_materials writer. */
export function prepareStarterMaterials(templateId) {
  const template = campaignById(templateId);
  if (!template) throw new Error('campaign_starter_not_found');
  return Object.entries(template.assets).map(([format, content]) => Object.freeze({
    material_type: format,
    channel_key: CREATIVE_CHANNELS[format] || format,
    title: template.name + ' — ' + format.replaceAll('_', ' '),
    content: JSON.parse(JSON.stringify(content)),
    state: 'draft',
    revision: 1,
    source: { kind: 'campaign_starter', template_id: template.id, template_version: template.template_version },
  }));
}
