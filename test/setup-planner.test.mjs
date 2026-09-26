import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSetupPlan, renderSetupPlan } from '../src/lib/setup/planner.js';
import { listCapabilityRecipes, getCapabilityRecipe } from '../src/lib/setup/recipes.js';
import { runSetup } from '../src/commands/setup.js';

test('recipes include image.vectorize and google.cloud', () => {
  const ids = listCapabilityRecipes().map((r) => r.id);
  assert.ok(ids.includes('image.vectorize'));
  assert.ok(ids.includes('google.cloud'));
  assert.equal(getCapabilityRecipe('image.vectorize').installPlans.darwin.provider, 'homebrew');
});

test('setup plan is satisfied when image tools already installed', async () => {
  const environment = {
    hostname: 'Test-Host',
    host_label: 'Mac',
    platform: 'darwin',
    arch: 'arm64',
    tools: {},
  };
  const plan = await buildSetupPlan({
    environment,
    capabilityIds: ['image.vectorize'],
  });
  assert.equal(plan.schema_version, 'agentsam-setup-plan-v1');
  const image = plan.capabilities.find((c) => c.id === 'image.vectorize');
  assert.ok(image);
  // This machine already has brew imagemagick/potrace from logo work — plan should reflect detect().
  if (image.detected?.ok) {
    assert.equal(plan.would_install.length, 0);
  } else {
    assert.ok(plan.would_install.length >= 1);
    assert.equal(plan.would_install[0].provider, 'homebrew');
  }
  const text = renderSetupPlan(plan);
  assert.match(text, /Agent Sam Setup|Vector image/);
});

test('renderSetupPlan shows would-install block for synthetic missing tools', () => {
  const text = renderSetupPlan({
    hostname: 'Test-Host',
    host_label: 'Mac',
    platform: 'darwin',
    capabilities: [
      {
        id: 'image.vectorize',
        displayName: 'Vector image tooling',
        detected: { ok: false, detail: 'missing' },
      },
    ],
    would_install: [
      { provider: 'homebrew', packages: ['imagemagick', 'potrace'], capability: 'image.vectorize' },
    ],
    providers: ['homebrew'],
    mutations: [],
    trust_notes: ['no silent trust'],
  });
  assert.match(text, /Would install/);
  assert.match(text, /imagemagick/);
  assert.match(text, /homebrew/);
});

test('setup --list and --dry-run exit 0', async () => {
  let out = '';
  const write = (s) => {
    out += s;
  };
  assert.equal(await runSetup(['--list'], { write, env: process.env }), 0);
  assert.match(out, /image\.vectorize/);
  out = '';
  assert.equal(await runSetup(['image.vectorize', '--dry-run'], { write, env: process.env }), 0);
  assert.match(out, /Environment|Agent Sam Setup/);
});
