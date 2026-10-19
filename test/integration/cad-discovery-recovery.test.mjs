import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCadRecovery,
  probeDockerDaemon,
} from '../../apps/cad-creator/bin/cad-discovery.mjs';

test('OpenSCAD recovery offers native rescan and explicit-approval Docker lane', () => {
  const recovery = getCadRecovery('openscad', 'darwin');
  assert.deepEqual(recovery.attempted_lanes, ['native', 'docker_service']);
  assert.equal(recovery.requires_approval, true);
  assert.equal(recovery.options.find(option => option.id === 'start_docker').command,
    'agentsam-cad-creator setup --docker');
  assert.equal(recovery.options.find(option => option.id === 'install_native').command,
    'brew install openscad');
});

test('Docker daemon discovery is read-only and handles an absent CLI', async () => {
  const result = await probeDockerDaemon({ env: { PATH: '' } });
  assert.deepEqual(result, { available: false, reason: 'docker_cli_not_found' });
});

test('host-install declares Docker opt-in and does not duplicate product fields', async () => {
  const { readFileSync } = await import('node:fs');
  const host = JSON.parse(readFileSync(new URL('../../apps/cad-creator/.agentsam/app.json', import.meta.url)));
  assert.equal(host.schema, 'agentsam.host-install.v1');
  assert.equal(host.config.runtime.docker_cad, 'explicit_approval');
  assert.equal('routes' in host, false);
  assert.equal('capabilities' in host, false);
});
