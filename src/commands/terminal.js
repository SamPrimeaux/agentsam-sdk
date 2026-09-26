/**
 * Device identity for terminal enrollment.
 * Printing identity never contacts the network. enroll only runs when the
 * caller names an existing instance or a new endpoint.
 */
import { postJson } from '../lib/core-client.js';
import { collectMachineIdentity } from '../lib/terminal/machine-identity.js';

function flag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
}

function printIdentity(identity, write) {
  write(`hostname:  ${identity.hostname || 'unknown'}`);
  write(`platform:  ${identity.platform || 'unknown'}`);
  write(`arch:      ${identity.arch || 'unknown'}`);
  write(`hw_model:  ${identity.model || 'unknown'}`);
}

export async function runTerminal(argv = [], options = {}) {
  const write = options.write || ((line) => console.log(line));
  const sub = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'identity';
  const json = argv.includes('--json') || options.json === true;
  const identity = await (options.collectIdentity || collectMachineIdentity)();
  const payload = {
    hostname: identity.hostname || null,
    platform: identity.platform || null,
    arch: identity.arch || null,
    hw_model: identity.model || null,
  };

  if (sub === 'identity') {
    if (json) write(JSON.stringify(payload));
    else printIdentity(identity, write);
    return { ok: true, ...payload };
  }

  if (sub !== 'enroll') {
    const error = 'Usage: agentsam terminal identity [--json]\n       agentsam terminal enroll [--instance <id>] [--endpoint <url>] [--json]';
    write(error);
    return { ok: false, error: 'terminal_usage' };
  }

  const instanceId = flag(argv, '--instance') || options.instanceId || null;
  const endpoint = flag(argv, '--endpoint') || options.endpoint || null;
  if (!instanceId && !endpoint) {
    if (json) {
      write(JSON.stringify({ ...payload, enrolled: false, reason: 'instance_or_endpoint_required' }));
    } else {
      printIdentity(identity, write);
      write('');
      write('No enrollment request sent. Pass --instance <id> to stamp an existing device, or --endpoint <url> to enroll a new local device.');
      write('A running ExecOS daemon stamps this same identity on every heartbeat.');
    }
    return { ok: true, enrolled: false, ...payload };
  }

  const body = {
    hostname: payload.hostname,
    platform: payload.platform,
    arch: payload.arch,
    hw_model: payload.hw_model,
    kind: 'local_device',
    name: payload.hostname || undefined,
  };
  if (instanceId) body.instance_id = instanceId;
  if (endpoint) body.endpoint_url = endpoint;

  const post = options.postJson || postJson;
  const result = await post('/api/terminal/connections/enrollment-token', body, options);
  const out = {
    ...payload,
    enrolled: true,
    instance_id: result?.instance_id || null,
    connection_id: result?.connection_id || null,
    enrollment_token_id: result?.enrollment_token_id || null,
  };
  if (json) write(JSON.stringify(out));
  else {
    write(`instance:  ${out.instance_id || 'unknown'}`);
    printIdentity(identity, write);
    if (result?.enrollment_token) {
      write('One-time enrollment token minted. Finish pairing on that machine with ExecOS bin/enroll.mjs --token <token>.');
    }
  }
  return { ok: true, ...out, enrollment_token: result?.enrollment_token || null };
}
