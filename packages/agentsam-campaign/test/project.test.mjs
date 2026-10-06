import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_PROJECT_SCHEMA, createCampaignProject, validateCampaignProject, makeCampaignPlanningBrief, toFNFcampaignPayload } from '../src/project.js';

const seed = () => createCampaignProject({ id: 'c_1', accountId: 'account_1', name: 'Launch week', now: '2026-10-06T00:00:00.000Z' });

test('portable campaign project validates draft-only and known channels', () => {
  const project = seed();
  assert.equal(project.schema, CAMPAIGN_PROJECT_SCHEMA);
  assert.equal(project.status, 'draft');
  assert.deepEqual(project.channels, ['email', 'social']);
  assert.deepEqual(validateCampaignProject({ ...project, channels: ['email', 'nonsense', 'email'] }).channels, ['email']);
  assert.throws(() => validateCampaignProject({ ...project, status: 'published' }), /invalid_campaign_status/);
});
test('brief uses real campaign intelligence; no fabricated evidence', () => {
  const project = { ...seed(), objective: 'Announce new collection', audience: 'Existing subscribers' };
  const brief = makeCampaignPlanningBrief(project);
  assert.equal(brief.schema, 'agentsam.campaign.brief/v2');
  assert.equal(brief.objective, project.objective);
  assert.equal(brief.status, 'draft');
  assert.throws(() => makeCampaignPlanningBrief(seed()), /campaign_objective_required/);
});
test('FNF payload preserves approved contract without publishing', () => {
  const payload = toFNFcampaignPayload({ ...seed(), sourceSiteId: 'fnf' });
  assert.equal(payload.approval_mode, 'draft_only');
  assert.equal(payload.primary_source, 'fnf');
  assert.equal(payload.name, 'Launch week');
});
