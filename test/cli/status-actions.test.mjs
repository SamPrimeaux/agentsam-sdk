import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatusActionPlan,
  formatStatusNextSteps,
} from '../../src/status/actions.js';
import { renderLocalStatus } from '../../src/ui/ansi.js';

test('healthy Cloudflare deployment wins over localhost', () => {
  const runtime = {
    ready: true,
    checks: {
      account: true,
      models: true,
      terminal: true,
      cloudflare: true,
    },
    local: {
      deployTarget: 'cloudflare',
      api: {
        online: false,
        url: 'http://127.0.0.1:8787/api/health',
      },
      db: {
        ready: true,
        exists: true,
      },
    },
    cloudflare: {
      configured: true,
      worker_name: 'agentsam-sdk',
      health: {
        ok: true,
        status: 200,
        url: 'https://agentsam.inneranimalmedia.com/health',
      },
    },
  };

  const plan = buildStatusActionPlan(runtime);
  const text = formatStatusNextSteps(plan);

  assert.match(plan.headline, /Live project healthy/);
  assert.ok(plan.actions.some((action) =>
    action.command === 'https://agentsam.inneranimalmedia.com'
  ));
  assert.ok(plan.actions.some((action) =>
    action.command === 'agentsam cloudflare status'
  ));
  assert.doesNotMatch(text, /npm run dev/);
  assert.match(text, /open https:\/\/agentsam\.inneranimalmedia\.com/);
});

test('compact local card prefers live deployment', () => {
  const text = renderLocalStatus({
    configured: true,
    project: 'agentsam-sdk',
    lane: 'custom',
    agent: 'default',
    git: {
      branch: 'main',
      revision: 'abcdef123456',
      dirty: false,
    },
    db: {
      ready: true,
      tables: [],
    },
    api: {
      online: false,
      url: 'http://127.0.0.1:8787/api/health',
    },
    pty: {
      online: true,
      url: 'http://127.0.0.1:3099/health',
    },
    deployTarget: 'cloudflare',
    live: {
      online: true,
      url: 'https://agentsam.inneranimalmedia.com/health',
    },
  });

  assert.match(text, /● live/);
  assert.match(text, /open https:\/\/agentsam\.inneranimalmedia\.com/);
  assert.match(text, /agentsam cloudflare status/);
  assert.doesNotMatch(text, /npm run dev/);
});
