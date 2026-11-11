import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'apps/frontend/public/site');
const staged = path.join(root, 'apps/local-studio/frontend/public/site');

test('public marketing asset extraction matches the canonical authoring site', () => {
  for (const name of [
    'agentsam-sdk-home.css','agentsam-sdk-type.css','agentsam-sdk-editorial.css',
    'agentsam-sdk-header.css','agentsam-sdk-footer.css','agentsam-sdk-shell.js',
  ]) {
    const relative = 'global/' + name;
    assert.ok(existsSync(path.join(source, relative)), relative);
    assert.equal(readFileSync(path.join(source, relative), 'utf8'),
      readFileSync(path.join(staged, relative), 'utf8'), relative);
  }
  const homepage = readFileSync(path.join(source,'home/index.html'),'utf8');
  assert.match(homepage, /agentsam-sdk-home[.]css/);
  assert.match(homepage, /agentsam-sdk-shell[.]js/);
  const doc = readFileSync(path.join(source,'docs/sam/infrastructure-cookbooks/index.html'),'utf8');
  assert.match(doc, /agentsam-docs-toc/);
  assert.match(doc, /On this page/);
});

test('bulk R2 site publisher never uploads CMS-owned HTML or shared partials', () => {
  const res = spawnSync(process.execPath,
    [path.join(root,'scripts/publish-website-assets.mjs'), '--dry-run','--only=global/agentsam-sdk-'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const lines = res.stdout.split('\n').filter(line => line.startsWith('{') && line.includes('dry_run'));
  assert.equal(lines.length, 6);
  for (const line of lines) {
    const item = JSON.parse(line);
    assert.match(item.key, /^sites\/agentsam-sdk\/public\/global\/agentsam-sdk-/);
    assert.doesNotMatch(item.key, /[.]html$/);
    assert.doesNotMatch(item.key, /partials\//);
  }
  const script = readFileSync(path.join(root,'scripts/publish-website-assets.mjs'),'utf8');
  assert.ok(script.includes('html_managed_by'));
  assert.ok(!script.includes('partials/header.html'), 'bulk publisher cannot blindly replace CMS header');
});

test('Worker routes the homepage, /site assets and public SAM docs through CMS R2 first', () => {
  const config = readFileSync(path.join(root,'apps/local-studio/backend/wrangler.jsonc'),'utf8');
  const first = JSON.parse(config.match(/"run_worker_first"\s*:\s*(\[[^\]]+\])/)[1]);
  for (const path of ['/','/site/*','/docs/*','/learn/*']) assert.ok(first.includes(path), path);
  const index = readFileSync(path.join(root,'apps/local-studio/backend/worker/index.js'),'utf8');
  assert.ok(index.includes("url.pathname === '/docs/'"));
  assert.ok(!index.includes("url.pathname.startsWith('/docs/')) {"), 'public guide routes cannot redirect to Settings docs');
});

test('reusable docs portal CSS and JavaScript are synced from one package into both public-site sources', () => {
  const assets = {
    'docs-portal.css': 'agentsam-docs-portal.css',
    'docs-portal-runtime.js': 'agentsam-docs-portal.js',
  };
  for(const [sourceFile,publicFile] of Object.entries(assets)){
    const canonical = readFileSync(path.join(root,'packages/agentsam-docs-theme',sourceFile),'utf8');
    for(const site of [source,staged])
      assert.equal(readFileSync(path.join(site,'global',publicFile),'utf8'),canonical,publicFile);
  }
});
