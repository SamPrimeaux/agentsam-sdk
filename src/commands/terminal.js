/**
 * Device identity + ExecOS pairing.
 *
 * Three AgentSam lanes (see docs/contracts/environment-vocabulary.md):
 *   AGENTSAM_API_KEY   — account / human (CLI, whoami, mint enrollment)
 *   AGENTSAM_BRIDGE_KEY — machine / worker (user123's Mac, VM, or Worker ↔ platform)
 *   IAM_CONNECTION_KEY — ExecOS connection-scoped secret for one terminal_connection
 *
 * local_device PTY daemons enroll with connection_token → IAM_CONNECTION_KEY.
 * That is not a substitute for AGENTSAM_API_KEY (account) or AGENTSAM_BRIDGE_KEY
 * (user-owned machine bridge for Workers/services). Bridge keys are minted per
 * account (brk_*) — not "platform-only."
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { homedir } from 'node:os';
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

function defaultExecosEnrollBin() {
  return path.join(homedir(), 'ExecOS', 'bin', 'enroll.mjs');
}

function pairWithExecos(enrollmentToken, options = {}) {
  const enrollBin = options.enrollBin || process.env.EXECOS_ENROLL_BIN || defaultExecosEnrollBin();
  const endpoint = options.endpoint || null;
  const args = [enrollBin, '--token', enrollmentToken, '--force'];
  if (endpoint) args.push('--tunnel-url', endpoint);
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
  return {
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    enroll_bin: enrollBin,
  };
}

export async function runTerminal(argv = [], options = {}) {
  const write = options.write || ((line) => console.log(line));
  const sub = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'identity';
  const json = argv.includes('--json') || options.json === true;
  const pair = argv.includes('--pair') || options.pair === true;
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
    write([
      'Usage: agentsam terminal identity [--json]',
      '       agentsam terminal enroll --instance <id> [--endpoint <url>] [--pair] [--json]',
      '',
      'Lanes:',
      '  AGENTSAM_API_KEY      account (CLI / whoami / mint enrollment) — required for this command',
      '  AGENTSAM_BRIDGE_KEY   your machine/Worker bridge (user-owned; mint via Local Studio)',
      '  IAM_CONNECTION_KEY    ExecOS connection_token for one terminal_connection (--pair writes it)',
    ].join('\n'));
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
      write('Pass --instance <id> to stamp/re-pair an existing device, or --endpoint <url> for a new local_device.');
      write('Requires AGENTSAM_API_KEY in the shell (source ~/.agentsam/load-agent-env.sh).');
      write('Add --pair to mint a connection_token and run ExecOS enroll (writes IAM_CONNECTION_KEY).');
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
  if (instanceId) {
    body.instance_id = instanceId;
    body.create_transport = false;
  }
  if (endpoint) body.endpoint_url = endpoint;

  const post = options.postJson || postJson;
  let result;
  try {
    result = await post('/api/terminal/connections/enrollment-token', body, options);
  } catch (error) {
    const message = error?.message || String(error);
    if (json) {
      write(JSON.stringify({ ok: false, error: message, ...payload }));
    } else {
      write(`enroll failed: ${message}`);
      if (/Unauthorized|SESSION_MISSING|IAM_OAUTH_ISSUER/i.test(message)) {
        write('next: source ~/.agentsam/load-agent-env.sh   # AGENTSAM_API_KEY + IAM_OAUTH_ISSUER');
      }
    }
    return { ok: false, error: message, ...payload };
  }

  const out = {
    ...payload,
    enrolled: true,
    instance_id: result?.instance_id || null,
    connection_id: result?.connection_id || null,
    enrollment_token_id: result?.enrollment_token_id || null,
    auth_mode: 'connection_token',
  };

  let paired = null;
  if (pair && result?.enrollment_token) {
    if (options.pairImpl) {
      paired = await options.pairImpl(result.enrollment_token, { endpoint: result.endpoint_url || endpoint });
    } else {
      paired = pairWithExecos(result.enrollment_token, {
        endpoint: result.endpoint_url || endpoint,
        enrollBin: options.enrollBin,
      });
    }
    out.paired = paired?.ok === true;
  }

  if (json) write(JSON.stringify({ ...out, enrollment_token: pair ? undefined : (result?.enrollment_token || null) }));
  else {
    write(`instance:   ${out.instance_id || 'unknown'}`);
    write(`connection: ${out.connection_id || 'unknown'}`);
    printIdentity(identity, write);
    write('auth_mode:  connection_token → IAM_CONNECTION_KEY (ExecOS daemon)');
    write('account:    AGENTSAM_API_KEY (CLI / whoami — keep loaded in the shell)');
    write('machine:    AGENTSAM_BRIDGE_KEY (your Worker/Mac bridge — mint in Local Studio; not platform-only)');
    if (pair) {
      write(paired?.ok ? '✓ ExecOS paired — IAM_CONNECTION_KEY written to private profile' : '✗ ExecOS pair failed');
    } else if (result?.enrollment_token) {
      write('Finish on that machine: node ~/ExecOS/bin/enroll.mjs --token <token> --force');
    }
  }
  return {
    ok: true,
    ...out,
    enrollment_token: result?.enrollment_token || null,
    pair_result: paired,
  };
}
