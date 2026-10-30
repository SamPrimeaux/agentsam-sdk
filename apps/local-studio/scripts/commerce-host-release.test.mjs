import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('original Ecommerce Theme Studio ships authoring and mobile dock without missing script tags', () => {
  const builder = read('../../ecommerce-cms-agentsam/bin/build-assets.mjs');
  for (const token of ['frontend/dock','frontend/profile-popup','cms/authoring/engine.ts',
    'theme-preview-registry.js','admin/js/cms-authoring-engine.js','dock.config.json']) {
    assert.ok(builder.includes(token), 'missing product asset contract: ' + token);
  }
  const page = read('../../ecommerce-cms-agentsam/frontend/static/theme-editor.html');
  assert.doesNotMatch(page, /theme-preview-runtime\.js/);
  assert.match(page, /cms-authoring-engine\.js/);
  const stage = read('../scripts/stage-shell-assets.mjs');
  for (const path of ['studio-cms-source-host.js', 'studio-cms-source-host.css']) assert.match(stage, new RegExp(path.replaceAll('.', '\\.')));
});
test('host routes authenticated Ecommerce CMS and AgentSam APIs rather than returning generic Nitro 404', () => {
  const worker = read('../backend/worker/index.js');
  for (const prefix of ['/api/admin/cms/','/api/admin/agentsam/','/api/admin/theme-editor/','/api/admin/store/']) {
    assert.ok(worker.includes('pathname.startsWith("' + prefix + '")'), 'missing hosted route: ' + prefix);
  }
  assert.match(worker, /resolveSessionUserId\(request, env\)/);
  assert.match(worker, /handleEcommerceAdminApi\(request, commerceEnv, url, context, studioUser\)/);
});
test('dock derives its actual tabs from ecommerce app manifest and avoids a competing shell', () => {
  const product=JSON.parse(read('../../ecommerce-cms-agentsam/agentsam.app.json'));
  assert.ok(product.dock.tabs.length >= 5);
  const source=read('../../ecommerce-cms-agentsam/frontend/dock/index.js');
  assert.match(source, /mountAdminDock/);
  assert.match(source, /host\.openNav/);
  assert.match(source, /host\.open/);
});
