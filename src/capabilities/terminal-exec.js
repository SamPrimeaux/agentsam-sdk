import path from 'node:path';
import os from 'node:os';
import { runProcess } from '../security/process.js';
import { redactDiagnosticValue } from '../errors/index.js';

const COMMAND_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 900_000;
const DEFAULT_OUTPUT_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function clean(value) { return value == null ? '' : String(value).trim(); }

// spawn() never invokes a shell for non-Windows commands (see security/process.js),
// so a leading `~` in a cwd override or an argv entry (e.g. `git -C ~/repo`) is never
// expanded by the OS. Expand it ourselves, matching standard shell semantics: only a
// leading `~` or `~/...` is special, never `~` mid-string.
function expandHome(value) {
  const str = clean(value);
  if (str !== '~' && !str.startsWith('~/')) return str;
  const home = os.homedir();
  if (!home) return str;
  return str === '~' ? home : path.join(home, str.slice(2));
}
function boundedInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}
function projectDirectory(root, relativeCwd = '') {
  const projectRoot = path.resolve(root || process.cwd());
  const directory = path.resolve(projectRoot, clean(relativeCwd) || '.');
  if (directory !== projectRoot && !directory.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error('terminal_relative_cwd_outside_project');
  }
  return { projectRoot, directory };
}

function subprocessEnvironment(env = process.env) {
  const blocked = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSCODE|API_KEY|PRIVATE_KEY|AUTHORIZATION|COOKIE|CREDENTIAL)(?:_|$)/i;
  return Object.fromEntries(Object.entries(env || {}).filter(([key]) => !blocked.test(key)));
}

/**
 * Run one argv-safe process for the interactive agent.
 *
 * The runtime owns the project root. The model may select only a relative
 * working directory inside that root, and never receives credential-bearing
 * environment variables through this capability.
 */
export async function terminalExec(input = {}, options = {}) {
  const command = clean(input.command);
  if (!COMMAND_RE.test(command)) throw new Error('terminal_command_must_be_pathless_executable');
  const args = Array.isArray(input.args) ? input.args.map((value) => expandHome(value)) : [];
  if (args.length > 128) throw new Error('terminal_argument_limit_exceeded');
  const { projectRoot, directory } = projectDirectory(expandHome(input.cwd) || options.cwd, input.relative_cwd);
  const timeoutMs = boundedInteger(input.timeout_ms, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxBytes = boundedInteger(input.max_output_bytes, DEFAULT_OUTPUT_BYTES, MAX_OUTPUT_BYTES);
  const runner = options.run || runProcess;
  const result = await runner(command, args, {
    cwd: directory,
    timeoutMs,
    maxBytes,
    signal: options.signal,
    env: subprocessEnvironment(options.env || process.env),
  });
  return Object.freeze({
    ok: result.code === 0,
    command,
    args,
    project_root: projectRoot,
    cwd: directory,
    exit_code: result.code,
    signal: result.signal || null,
    stdout: redactDiagnosticValue(String(result.stdout || ''), { maxChars: maxBytes }),
    stderr: redactDiagnosticValue(String(result.stderr || ''), { maxChars: maxBytes }),
  });
}
