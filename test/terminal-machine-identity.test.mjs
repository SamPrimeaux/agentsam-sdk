import assert from 'node:assert/strict';
import test from 'node:test';

import { runTerminal } from '../src/commands/terminal.js';
import { normalizeTerminalArch, normalizeTerminalPlatform } from '../src/lib/terminal/machine-identity.js';

test('identity command prints this host vocabulary without calling the network', async () => {
  const lines = [];
  const result = await runTerminal(['identity'], {
    write: (line) => lines.push(line),
    collectIdentity: async () => ({
      hostname: 'Sams-iMac',
      platform: 'macos',
      arch: 'arm64',
      model: 'Mac16,2',
    }),
    postJson: async () => {
      throw new Error('identity must not post');
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.arch, 'arm64');
  assert.match(lines.join('\n'), /arch:\s+arm64/);
  assert.match(lines.join('\n'), /hw_model:\s+Mac16,2/);
});

test('enroll without a target does not mint a token', async () => {
  let posted = false;
  const result = await runTerminal(['enroll', '--json'], {
    write: () => {},
    collectIdentity: async () => ({ hostname: 'box', platform: 'linux', arch: 'x86_64', model: 'container' }),
    postJson: async () => { posted = true; return {}; },
  });
  assert.equal(posted, false);
  assert.equal(result.enrolled, false);
  assert.equal(result.arch, 'x86_64');
});

test('enroll posts canonical identity for the instance the caller named', async () => {
  let body = null;
  const result = await runTerminal(['enroll', '--instance', 'tinst_sams_imac', '--json'], {
    write: () => {},
    collectIdentity: async () => ({
      hostname: 'Sams-iMac',
      platform: 'macos',
      arch: 'arm64',
      model: 'Mac16,2',
    }),
    postJson: async (_path, posted) => {
      body = posted;
      return { instance_id: 'tinst_sams_imac', connection_id: 'conn_mac_local', enrollment_token_id: 'tenr_test', enrollment_token: 'tok_test' };
    },
  });
  assert.equal(result.enrolled, true);
  assert.equal(body.instance_id, 'tinst_sams_imac');
  assert.equal(body.platform, 'macos');
  assert.equal(body.arch, 'arm64');
  assert.equal(body.hw_model, 'Mac16,2');
  assert.equal(body.kind, 'local_device');
});

test('enroll --pair consumes the token via ExecOS enroll (connection_token, not bridge)', async () => {
  let pairedToken = null;
  const result = await runTerminal(['enroll', '--instance', 'tinst_sams_imac', '--pair', '--json'], {
    write: () => {},
    collectIdentity: async () => ({ hostname: 'box', platform: 'macos', arch: 'arm64', model: 'Mac16,2' }),
    postJson: async () => ({
      instance_id: 'tinst_sams_imac',
      connection_id: 'conn_mac_local',
      enrollment_token: 'tok_pair',
      endpoint_url: 'https://localpty.inneranimalmedia.com',
    }),
    pairImpl: async (token) => {
      pairedToken = token;
      return { ok: true };
    },
  });
  assert.equal(pairedToken, 'tok_pair');
  assert.equal(result.paired, true);
  assert.equal(result.auth_mode, 'connection_token');
});

test('normalizer matches the worker vocabulary', () => {
  assert.equal(normalizeTerminalPlatform('darwin'), 'macos');
  assert.equal(normalizeTerminalPlatform('win32'), 'windows');
  assert.equal(normalizeTerminalArch('x64'), 'x86_64');
  assert.equal(normalizeTerminalArch('aarch64'), 'arm64');
});
