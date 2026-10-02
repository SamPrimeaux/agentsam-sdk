import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

const settingsPage = read('apps/local-studio/frontend/src/components/settings/LocalStudioSettingsPage.tsx');
const settingsHost = read('apps/local-studio/frontend/src/components/settings/localStudioSettingsHost.ts');
const shell = read('apps/local-studio/frontend/agentsam/AgentSamShell.tsx');
const keysPage = read('apps/local-studio/frontend/src/components/settings/LiveKeysSettingsPage.tsx');
const apiKeys = read('apps/local-studio/frontend/src/components/settings/ApiKeysTable.tsx');
const settingsFrontend = read('packages/agentsam-settings/src/frontend/index.tsx');

test('production Settings never mounts fixture data', () => {
  assert.doesNotMatch(settingsPage, /createFixtureSettingsHost|getSettingsFixture|SettingsFixtureName/);
  assert.doesNotMatch(settingsHost, /demo-app|Demo Org|health:\s*["']healthy["']/i);
  assert.match(settingsHost, /loadEffectiveModelInventory/);
  assert.match(settingsHost, /identitySessionExists/);
  assert.match(settingsHost, /getDesktopWorkspaceContext/);
  assert.match(settingsHost, /repositoryLabel:\s*["']Local runtime["']/);
  assert.match(settingsHost, /browser:\s*["']Available["']/);
  assert.match(settingsHost, /health:\s*["']unknown["']/);
  assert.doesNotMatch(settingsFrontend, /demo-app|Demo Org/);
});

test('Settings route suppresses the outer application sidenav', () => {
  assert.match(shell, /const isSettings = pathname === ['"]\/settings['"] \|\| pathname\.startsWith\(['"]\/settings\/['"]\)/);
  assert.match(shell, /!isSettings \? <Nav\.Sidenav \/> : null/);
});

test('Keys page has a visible explicit AgentSam key trigger', () => {
  assert.match(keysPage, /variant="secondary"/);
  assert.match(keysPage, /Create AgentSam key/);
});

test('account provider rows show live discovery trust status', () => {
  assert.match(apiKeys, /accountInventoryRequest/);
  assert.match(apiKeys, /Connected · \$\{count\} model/);
  assert.match(apiKeys, /rejected this key/);
  assert.match(apiKeys, /Not selected/);
});
