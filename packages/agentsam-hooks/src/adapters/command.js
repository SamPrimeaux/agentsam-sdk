import { spawn } from 'node:child_process';

const PORTABLE_ENV_KEYS = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'WINDIR',
  'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL',
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function portableEnvironment(extra = {}, inheritEnvironment = false) {
  const environment = {};
  const source = typeof process === 'undefined' ? {} : process.env;
  if (inheritEnvironment) Object.assign(environment, source);
  else for (const key of PORTABLE_ENV_KEYS) if (source[key] != null) environment[key] = source[key];
  for (const [key, value] of Object.entries(extra || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`invalid_hook_environment_key:${key}`);
    if (value != null) environment[key] = String(value);
  }
  return environment;
}

function parseOutput(stdout, command) {
  const text = stdout.trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter(Boolean);
  try { return JSON.parse(lines.at(-1)); }
  catch (error) {
    const failure = new Error(`hook_command_invalid_json:${command}:${error.message}`);
    failure.code = 'AGENTSAM_HOOK_INVALID_OUTPUT';
    throw failure;
  }
}

export function createCommandHookAdapter(options = {}) {
  const command = clean(options.command);
  if (!command) throw new TypeError('hook_command_required');
  const args = Array.isArray(options.args) ? options.args.map(String) : [];
  const timeoutMs = Number(options.timeout_ms ?? options.timeoutMs ?? 10_000);
  const maxOutputBytes = Number(options.max_output_bytes ?? options.maxOutputBytes ?? 1_048_576);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new RangeError('invalid_hook_command_timeout');
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 16_777_216) throw new RangeError('invalid_hook_command_output_limit');

  return (envelope) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || envelope.cwd,
      env: portableEnvironment(options.env, options.inherit_environment === true || options.inheritEnvironment === true),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const fail = (message, code = 'AGENTSAM_HOOK_COMMAND_FAILED') => {
      const error = new Error(message);
      error.code = code;
      finish(reject, error);
    };
    const append = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        fail(`hook_command_output_limit_exceeded:${command}:${maxOutputBytes}`, 'AGENTSAM_HOOK_OUTPUT_LIMIT');
        return target;
      }
      return target + chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', (error) => fail(`hook_command_spawn_failed:${command}:${error.message}`));
    child.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        fail(`hook_command_failed:${command}:exit=${code ?? 'null'}:signal=${signal || 'none'}:${stderr.trim().slice(0, 512)}`);
        return;
      }
      try { finish(resolve, parseOutput(stdout, command)); }
      catch (error) { finish(reject, error); }
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 250);
      killTimer.unref?.();
      fail(`hook_command_timeout:${command}:${timeoutMs}`, 'AGENTSAM_HOOK_TIMEOUT');
    }, timeoutMs);
    timer.unref?.();
    child.stdin.end(`${JSON.stringify(envelope)}\n`);
  });
}
