import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readApp = async (id) => JSON.parse(await readFile(path.join(appRoot, 'apps', id, 'agentsam.app.json'), 'utf8'));

test('merchant Apps resolve domain capabilities instead of raw Cloudflare/D1/R2 power', async () => {
  for (const id of ['product-studio','growth','completeful','resend']) {
    const app = await readApp(id);
    const capabilityBlob = JSON.stringify(app.agent || {});
    assert.doesNotMatch(capabilityBlob, /\b(?:cf|d1|r2)\./, `${id} should not request low-level infrastructure capabilities directly`);
  }
});

test('Completeful policy preserves approval gates for order creation and product publishing', async () => {
  const app = await readApp('completeful');
  assert.deepEqual(app.agent.capabilities.approval_required, ['commerce.order.create','commerce.product.publish']);
  assert.ok(app.agent.capabilities.read.includes('commerce.order.quote'));
});

test('Product Studio consumes provider/domain capabilities without becoming Completeful-shaped', async () => {
  const app = await readApp('product-studio');
  assert.ok(app.agent.capabilities.read.includes('commerce.catalog.read'));
  assert.ok(app.agent.capabilities.write.includes('commerce.design.create'));
  assert.ok(!JSON.stringify(app.agent).includes('completeful_'));
});

test('Growth and Resend expose registered scoped AgentSam tools', async () => {
  const growth = await readApp('growth');
  const resend = await readApp('resend');
  assert.equal(growth.agent.status, 'registered');
  assert.ok(growth.agent.tools.includes('growth_campaigns_list'));
  assert.ok(growth.agent.capabilities.approval_required.includes('campaign.publish'));
  assert.equal(resend.agent.status, 'registered');
  assert.ok(resend.agent.tools.includes('email_messages_list'));
  assert.ok(resend.agent.capabilities.approval_required.includes('email.send'));
});
