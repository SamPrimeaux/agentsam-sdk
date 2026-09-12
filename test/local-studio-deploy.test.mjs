import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEPLOY_INPUT_GLOBS,
  loadOptionalCloudflareEnv,
  resolveLocalStudioDeployable,
  wranglerDeployCommand,
  isLocalStudioCheckout,
  runLocalStudioDeploy,
} from '../src/lib/deploy/local-studio.js';
import { productionDeployBlockedReason } from '../src/lib/deploy/git-guard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('local-studio deploy resolver', () => {
  it('resolves apps/local-studio + backend/wrangler.jsonc from the repo', () => {
    const target = resolveLocalStudioDeployable(root);
    assert.equal(target.provider, 'cloudflare');
    assert.equal(target.app, 'local-studio');
    assert.equal(path.basename(path.dirname(target.wranglerConfig)), 'backend');
    assert.deepEqual(target.wranglerArgs, ['deploy', '-c', 'backend/wrangler.jsonc']);
    assert.equal(isLocalStudioCheckout(root), true);
    const cmd = wranglerDeployCommand(target, { dryRun: true });
    assert.equal(cmd.bin, 'npx');
    assert.equal(cmd.cwd, target.appRoot);
    assert.deepEqual(cmd.args, ['wrangler', 'deploy', '-c', 'backend/wrangler.jsonc', '--dry-run']);
  });

  it('fingerprints the cloudflare connector package', () => {
    assert.equal(DEPLOY_INPUT_GLOBS.includes('packages/connectors/cloudflare'), true);
    assert.equal(DEPLOY_INPUT_GLOBS.includes('apps/local-studio'), true);
  });

  it('treats missing .env.cloudflare as optional', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-env-'));
    const loaded = loadOptionalCloudflareEnv(tmp);
    assert.equal(loaded.loaded, false);
    assert.deepEqual(loaded.vars, {});
  });

  it('plan does not invoke wrangler', async () => {
    const result = await runLocalStudioDeploy({ cwd: root, planOnly: true, execute: false });
    assert.equal(result.plan.provider, 'cloudflare');
    assert.equal(result.plan.wranglerConfig, 'apps/local-studio/backend/wrangler.jsonc');
    assert.equal(result.plan.genericRootDeploy, false);
    assert.equal(result.receipt.plan, true);
    assert.equal(result.receipt.promoted, false);
    assert.equal(result.receipt.wranglerConfig, 'apps/local-studio/backend/wrangler.jsonc');
    assert.equal(result.receipt.hostname, 'agentsam.inneranimalmedia.com');
  });

  it('blocks production deploys from feat branches', () => {
    const reason = productionDeployBlockedReason({
      ok: true,
      branch: 'feat/cloudflare-connector-deploy-control',
      detached: false,
      head: 'aaa',
      originMain: 'aaa',
      dirty: false,
      tmpCheckout: false,
      repoRoot: root,
    });
    assert.match(reason, /feat\/cloudflare-connector-deploy-control/);
  });

  it('allows production only when HEAD is a clean origin/main', () => {
    const reason = productionDeployBlockedReason({
      ok: true,
      branch: 'main',
      detached: false,
      head: 'abc',
      originMain: 'abc',
      dirty: false,
      tmpCheckout: false,
      repoRoot: root,
    });
    assert.equal(reason, null);
  });
});
