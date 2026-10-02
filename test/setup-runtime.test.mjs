import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  RUNTIME_PROFILES,
  planRuntimeSetup,
  writeRuntimePlanReceipt,
  renderRuntimePlan,
} from '../src/lib/setup/runtime.js';

describe('agentsam setup runtime', () => {
  it('exposes five goal profiles', () => {
    assert.equal(RUNTIME_PROFILES.length, 5);
    assert.ok(RUNTIME_PROFILES.some((p) => p.id === 'my_computer'));
    assert.ok(RUNTIME_PROFILES.every((p) => p.runtime_adapter));
  });

  it('plans with GOAP and writes receipt under tmp home', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-runtime-'));
    const plan = await planRuntimeSetup({
      home,
      facts: {
        schema: 'agentsam.runtime-setup.v1',
        protocol: 'agentsam.runtime.v1',
        host: { hostname: 'test', platform: 'darwin', arch: 'arm64', label: 'Mac' },
        tools: { docker: true, gcloud: false, wrangler: true, go: true },
        agentsamd: { binary: null, installed: false, prior_receipt: null },
        available_capabilities: {
          exec: true,
          pty: true,
          filesystem: true,
          process: true,
          git: true,
          docker: true,
          ports: true,
          persistent_filesystem: true,
        },
      },
    });
    assert.ok(plan.recommended);
    assert.equal(plan.recommended.profile.id, 'my_computer');
    assert.ok(plan.recommended.goap.action_ids.includes('ensure_agentsamd_binary'));
    const receipt = writeRuntimePlanReceipt(plan, home);
    assert.ok(fs.existsSync(receipt));
    const text = renderRuntimePlan(plan);
    assert.match(text, /setup runtime/);
    assert.match(text, /My Computer/);
    assert.match(text, /target plan:/);
  });
});

it('does not recommend reinstalling agentsamd when it is already installed', async () => {
  const plan = await planRuntimeSetup({
    facts: {
      schema: 'agentsam.runtime-setup.v1',
      protocol: 'agentsam.runtime.v1',
      host: { hostname: 'test', platform: 'darwin', arch: 'arm64', label: 'Mac' },
      tools: { docker: true, gcloud: false, wrangler: true, go: true },
      agentsamd: { binary: '/tmp/agentsamd', installed: true, prior_receipt: 'agentsamd' },
      available_capabilities: {
        exec: true, pty: true, filesystem: true, process: true, git: true,
        docker: true, ports: true, persistent_filesystem: true,
      },
    },
  });
  const text = renderRuntimePlan(plan);
  assert.match(text, /agentsam runtime status/);
  assert.doesNotMatch(text, /Next[\s\S]*agentsam runtime install/);
});
