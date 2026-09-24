import test from 'node:test';
import assert from 'node:assert/strict';
import { projectComposerPlugins } from '../frontend/agentsam/plugins.ts';

test('composer projects only enabled visible registry installations', () => {
  const row = { id: 'installation', plugin_key: 'example', display_name: 'Example', composer_visible: 1, is_enabled: 1, setup_status: 'connected', health_status: 'healthy', mention_aliases: ['example', '@example'], auth_type: 'oauth' };
  const plugins = projectComposerPlugins([row, { ...row, is_enabled: 0 }, { ...row, composer_visible: 0 }]);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].mention, '@example');
  assert.equal(plugins[0].ready, true);
  assert.equal(projectComposerPlugins([{ ...row, setup_status: 'configured' }])[0].ready, false);
  assert.equal(projectComposerPlugins([{ ...row, health_status: 'auth_error' }])[0].ready, false);
  assert.equal(projectComposerPlugins([{ ...row, setup_status: 'configured', auth_type: 'workers_binding' }])[0].ready, true);
  assert.deepEqual(projectComposerPlugins(null), []);
});
