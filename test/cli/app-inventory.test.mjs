import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildAppInventory, formatAppInventory } from '../../src/commands/app-inventory.js';
import { runApp } from '../../src/commands/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('source inventory distinguishes app identities from modules, providers, and SDK packages', () => {
  const inventory = buildAppInventory(ROOT);

  assert.equal(inventory.counts.applications, 7);
  assert.equal(inventory.counts.modules, 4);
  assert.equal(inventory.counts.providers, 2);
  assert.equal(inventory.counts.appScopedSupportingPackages, 3);

  assert.deepEqual(
    inventory.applications.map((item) => item.id).sort(),
    ['cad-creator', 'design-canvas', 'ecommerce-cms-agentsam', 'goalguru', 'local-studio', 'moviemode', 'samsketch'],
  );

  const moviemode = inventory.applications.find((item) => item.id === 'moviemode');
  assert.equal(moviemode.sourceDirectory, 'apps/agentsam-copro-studio');
  assert.equal(moviemode.package.nameMatch, true);
  assert.equal(moviemode.directoryIdMatch, 'declared-exception');
  assert.ok(moviemode.declaredModules.some((item) => item.id === 'copro'));

  const goalguru = inventory.applications.find((item) => item.id === 'goalguru');
  assert.equal(goalguru.sourceDirectory, 'packages/agentsam-goalguru');
  assert.equal(goalguru.installDeclaration, 'install-supported-declared');

  const forms = inventory.modules.find((item) => item.id === 'agentsamforms');
  assert.equal(forms.ownerAppId, 'ecommerce-cms-agentsam');
  assert.equal(forms.declaredRuntimeHostAppId, 'local-studio');
  assert.equal(forms.runtimeHostAppId, 'local-studio');
  assert.equal(forms.implementationRoot, 'apps/local-studio');
  assert.equal(forms.missingImplementationPaths.length, 0);

  const samspeaks = inventory.modules.find((item) => item.id === 'samspeaks');
  assert.equal(samspeaks.ownerAppId, 'moviemode');
  assert.equal(samspeaks.installable, false);

  assert.equal(inventory.providers.find((item) => item.id === 'completeful').ownerAppId, 'ecommerce-cms-agentsam');
  assert.equal(inventory.providers.find((item) => item.id === 'resend').ownerAppId, 'ecommerce-cms-agentsam');

  assert.equal(inventory.implementationFamilies.copro.length, 10);
  assert.equal(inventory.implementationFamilies.iamscene[0].sourceDirectory, 'packages/iamscene');
  assert.equal(inventory.implementationFamilies.databaseEditor[0].sourceDirectory, 'packages/agentsam-database-editor');
  assert.ok(inventory.warnings.some((warning) => warning.includes('module copro using the same npm package')));
  assert.ok(inventory.warnings.some((warning) => warning.includes('moviemode uses the declared directory_id_exception')));
  assert.equal(inventory.warnings.some((warning) => warning.includes('goalguru uses the declared directory_id_exception')), false);
});

test('inventory CLI supports JSON and human-readable output without changing app list semantics', async () => {
  let jsonOutput = '';
  await runApp(['inventory', '--json'], {
    root: ROOT,
    noExit: true,
    write: (value) => { jsonOutput += value; },
  });
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.counts.applications, 7);
  assert.equal(parsed.counts.modules, 4);

  const human = formatAppInventory(parsed);
  assert.match(human, /APPLICATION IDENTITIES/);
  assert.match(human, /EMBEDDED MODULES/);
  assert.match(human, /PROVIDER INTEGRATIONS/);
  assert.match(human, /not proof of installability/);

  let listOutput = '';
  const listed = await runApp(['list'], {
    root: ROOT,
    noExit: true,
    write: (value) => { listOutput += value; },
  });
  assert.equal(listed.length, 7);
  assert.match(listOutput, /manifest-registered identities/);
  assert.match(listOutput, /not an installability or release check/);
});
