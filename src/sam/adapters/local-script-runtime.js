/**
 * Local, explicitly authorized Superbash executor. Uses the existing bounded
 * process runner; does not call Cloudflare, ExecOS or a sandbox provider.
 *
 * IMPORTANT: cwd validation is not a security sandbox. Callers must approve
 * shell execution in this trusted user environment; untrusted code requires
 * a separately authorized isolated runner.
 */
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { runProcess } from '../../security/process.js';
import { redactDiagnosticValue } from '../../errors/index.js';

const MAX_SCRIPT_BYTES = 200_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const OUTPUT_BYTES = 256 * 1024;
const SAFE_ENV_KEYS = Object.freeze(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'NO_COLOR', 'USER', 'LOGNAME', 'SYSTEMROOT', 'COMSPEC']);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const bounded = (value, fallback, maximum) =>
  Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;

export function localScriptEnvironment(hostEnv = process.env) {
  return Object.fromEntries(SAFE_ENV_KEYS.filter(key => typeof hostEnv[key] === 'string').map(key => [key, hostEnv[key]]));
}

// Match the executable search path used by the actual subprocess environment.
// Missing Bash is a genuinely unbound capability, not a fake installed tool.
export function isLocalBashAvailable(hostEnv = process.env) {
  const filename = process.platform === 'win32' ? 'bash.exe' : 'bash';
  return String(hostEnv.PATH || '').split(path.delimiter).some(folder => {
    if (!folder || !path.isAbsolute(folder)) return false;
    try { accessSync(path.join(folder, filename), constants.X_OK); return true; }
    catch { return false; }
  });
}

export function createLocalScriptRuntime({
  root,
  env = process.env,
  run = runProcess,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = OUTPUT_BYTES,
  maxConcurrent = 2,
} = {}) {
  if (!path.isAbsolute(root || '')) throw new Error('script_workspace_root_required');
  const hostRoot = path.resolve(root);
  const limitMs = bounded(timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const limitBytes = bounded(maxOutputBytes, OUTPUT_BYTES, 1024 * 1024);
  let active = 0;

  async function executeScript({
    accountId, actorId, installationId, script,
    relativeCwd = '.', laneRef = null, signal, onEvent, idempotencyKey,
  } = {}) {
    if (!accountId || !actorId || !installationId) throw new Error('trusted_identity_required');
    if (laneRef != null && laneRef !== 'local' && laneRef !== 'owned-device') throw new Error('local_script_lane_denied');
    if (typeof script !== 'string' || !script.trim() || Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES || script.includes('\0')) {
      throw new Error('script_source_invalid');
    }
    if (typeof relativeCwd !== 'string' || path.isAbsolute(relativeCwd) || relativeCwd.includes('\0')) {
      throw new Error('script_relative_cwd_invalid');
    }
    const canonicalRoot = await realpath(hostRoot);
    const target = path.resolve(canonicalRoot, relativeCwd);
    if (target !== canonicalRoot && !target.startsWith(canonicalRoot + path.sep)) {
      throw new Error('script_relative_cwd_outside_project');
    }
    const cwd = await realpath(target);
    if (cwd !== canonicalRoot && !cwd.startsWith(canonicalRoot + path.sep)) {
      throw new Error('script_relative_cwd_outside_project');
    }
    if (active >= maxConcurrent) throw new Error('script_runtime_busy');
    const executionId = 'sex_' + randomUUID().replaceAll('-', '');
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const scriptHash = sha(script);
    const receiptBase = {
      executionId, lane: 'local', runtime: 'node-bash-process',
      scriptHash, scriptBytes: Buffer.byteLength(script, 'utf8'),
      cwd, startedAt, timeoutMs: limitMs,
      idempotencyKeyHash: idempotencyKey ? sha(String(idempotencyKey)) : null,
    };
    const emit = (phase) => { try { onEvent?.({ schema: 'agentsam.script.event.v1', executionId, phase }); } catch { /* listeners are advisory */ } };
    active++;
    try {
      emit('started');
      // Bash -c is intentional here; no profile files or cloud fallback.
      const result = await run('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
        cwd, env: localScriptEnvironment(env), timeoutMs: limitMs,
        maxBytes: limitBytes, signal, shell: false,
      });
      const exitCode = Number.isInteger(result.code) ? result.code : null;
      const status = exitCode === 0 && !result.signal ? 'completed' : 'failed';
      emit(status);
      return {
        ...receiptBase, status, exitCode, signal: result.signal || null,
        stdout: redactDiagnosticValue(String(result.stdout || ''), { maxChars: limitBytes }),
        stderr: redactDiagnosticValue(String(result.stderr || ''), { maxChars: limitBytes }),
        completedAt: new Date().toISOString(), durationMs: Date.now() - started,
      };
    } catch (error) {
      const reason = error?.code || 'script_runtime_error';
      const status = reason === 'process_timeout' ? 'timed_out'
        : reason === 'process_cancelled' ? 'cancelled'
        : reason === 'process_output_limit' ? 'output_limit' : 'failed';
      emit(status);
      return {
        ...receiptBase, status, exitCode: null, signal: null,
        stdout: redactDiagnosticValue(String(error?.stdout || ''), { maxChars: limitBytes }),
        stderr: redactDiagnosticValue(String(error?.stderr || ''), { maxChars: limitBytes }),
        error: { code: reason, message: status === 'failed' ? 'Local process could not complete' : status },
        completedAt: new Date().toISOString(), durationMs: Date.now() - started,
      };
    } finally {
      active--;
    }
  }
  return Object.freeze({ executeScript });
}
