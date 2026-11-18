import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  starterCampaigns, catalogMeta, campaignById,
  prepareCampaignFromStarter, prepareStarterMaterials,
} from '../src/starter-library.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = path.join(root, 'starter-packs/increase-sales/v1');
const dist = path.join(pack, 'dist');

test('Increase Sales pack is owned by agentsam-campaign and includes fourteen distinct starters', () => {
  assert.equal(starterCampaigns.length, 14);
  assert.equal(catalogMeta.objective_key, 'increase_sales');
  assert.equal(new Set(starterCampaigns.map(t => t.id)).size, 14);
  assert.equal(new Set(starterCampaigns.map(t => t.visual_key)).size, 14);
  for (const template of starterCampaigns) {
    assert.equal(template.preview.mode, 'demo_only');
    assert.equal(campaignById(template.id), template);
    assert.ok(template.required_checks.length >= 2);
    assert.ok(template.fields.length >= 4);
    assert.ok(template.reporting.metrics.includes('attributed_net_revenue'));
    assert.equal(prepareStarterMaterials(template.id).length, 6);
  }
});

test('starter-to-campaign mapping follows the canonical store input contract without tenant-controlled scope', () => {
  const payload = prepareCampaignFromStarter('product-launch', {
    name: 'Example product launch',
    slug: 'example-product-launch',
    audience: 'example_segment',
  });
  assert.equal(payload.kind, 'marketing');
  assert.equal(payload.objective, 'increase_sales');
  assert.equal(payload.approval_mode, 'manual');
  assert.equal(payload.attributes.starter.key, 'product-launch');
  assert.equal(payload.attributes.preview_only, true);
  assert.equal('scope_id' in payload, false);
  assert.equal('account_id' in payload, false);
  assert.equal('status' in payload, false);
  assert.throws(() => prepareCampaignFromStarter('missing', { name:'Example',slug:'example' }), /starter_not_found/);
  assert.throws(() => prepareCampaignFromStarter('flash-sale', { name:'Example',slug:'../bad' }), /invalid_campaign_slug/);
  assert.throws(() => prepareCampaignFromStarter('flash-sale', { name:'Example',slug:'test',starts_at:'2027-01-02',ends_at:'2027-01-01' }), /invalid_campaign_schedule/);
});

test('standalone starter pack builds all independent previews without another CMS schema', async () => {
  execFileSync(process.execPath, [path.join(pack, 'build.mjs')], { cwd: pack, stdio: 'pipe' });
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
  assert.equal(manifest.template_count, 14);
  assert.equal(manifest.interactive_preview_count, 14);
  assert.equal(manifest.file_count, 117);
  for (const template of starterCampaigns) {
    assert.ok((await stat(path.join(dist, template.slug + '.html'))).size > 10000);
    const file = JSON.parse(await readFile(path.join(dist,'templates',template.slug+'.json'), 'utf8'));
    assert.equal(file.id, template.id);
    for (const format of ['website','email','social','product_card','sms','paid_ad']) {
      const creative = JSON.parse(await readFile(path.join(dist,'creative',template.slug,format+'.json'), 'utf8'));
      assert.equal(creative.published, false);
    }
  }
});
