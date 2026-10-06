import { buildCampaignBrief } from './index.js';

export const CAMPAIGN_PROJECT_SCHEMA = 'agentsam.campaign.project/v1';
const VALID_CHANNELS = new Set(['email', 'social', 'site', 'search']);
const VALID_STATUSES = new Set(['draft', 'review']);

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function channels(value) { return [...new Set((Array.isArray(value) ? value : []).filter((v) => VALID_CHANNELS.has(v)))]; }

export function validateCampaignProject(input) {
  if (!input || typeof input !== 'object' || input.schema !== CAMPAIGN_PROJECT_SCHEMA) throw new Error('invalid_campaign_project_schema');
  if (!text(input.id) || !text(input.accountId)) throw new Error('campaign_identity_required');
  if (!text(input.name)) throw new Error('campaign_name_required');
  if (!VALID_STATUSES.has(input.status)) throw new Error('invalid_campaign_status');
  return {
    schema: CAMPAIGN_PROJECT_SCHEMA,
    id: text(input.id),
    accountId: text(input.accountId),
    name: text(input.name),
    objective: text(input.objective),
    audience: text(input.audience),
    offer: text(input.offer),
    brief: text(input.brief),
    sourceBrandId: text(input.sourceBrandId),
    sourceSiteId: text(input.sourceSiteId),
    channels: channels(input.channels),
    status: input.status,
    approvalMode: 'draft_only',
    startDate: text(input.startDate),
    endDate: text(input.endDate),
    material: {
      headline: text(input.material?.headline),
      body: text(input.material?.body),
      cta: text(input.material?.cta),
      landingUrl: text(input.material?.landingUrl),
      emailSubject: text(input.material?.emailSubject),
      socialCaption: text(input.material?.socialCaption),
      mediaAssetId: text(input.material?.mediaAssetId),
    },
    createdAt: text(input.createdAt),
    updatedAt: text(input.updatedAt),
  };
}

export function createCampaignProject({ id, accountId, name, now, sourceBrandId = '', sourceSiteId = '' }) {
  if (!text(id) || !text(accountId) || !text(now)) throw new Error('campaign_identity_required');
  return validateCampaignProject({
    schema: CAMPAIGN_PROJECT_SCHEMA, id, accountId, name, status: 'draft',
    sourceBrandId, sourceSiteId, channels: ['email', 'social'],
    createdAt: now, updatedAt: now, material: {},
  });
}

export function makeCampaignPlanningBrief(project) {
  const valid = validateCampaignProject(project);
  if (!valid.objective) throw new Error('campaign_objective_required');
  // Reuse the actual portable campaign intelligence package, never invent metrics.
  return buildCampaignBrief({
    id: valid.id + ':brief', objective: valid.objective,
    audience: valid.audience ? { description: valid.audience } : null,
    offer: valid.offer || null,
    context: { channels: valid.channels, content: valid.material },
  });
}

export function toFNFcampaignPayload(project) {
  const valid = validateCampaignProject(project);
  return {
    name: valid.name, goal: valid.objective, audience: valid.audience,
    brief: valid.brief, channels: valid.channels, approval_mode: 'draft_only',
    primary_source: valid.sourceSiteId || null, start_date: valid.startDate || null,
    end_date: valid.endDate || null,
    metadata: { sourceBrandId: valid.sourceBrandId, material: valid.material },
  };
}
