import fs from 'node:fs';
import path from 'node:path';
import { runProcess } from '../security/process.js';
import { AgentSamDiagnosticError, redactDiagnosticValue } from '../errors/index.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function positiveInteger(value, fallback) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; }

export const WRANGLER_NATIVE_COMMANDS = Object.freeze([
  Object.freeze({ id: 'whoami', argv: ['whoami', '--json'], risk: 'read', output: 'json', description: 'Read authenticated Cloudflare user/account membership without exposing the auth token.' }),
  Object.freeze({ id: 'deployments.list', argv: ['deployments', 'list', '--json'], risk: 'read', output: 'json', description: 'List recent Worker deployments.' }),
  Object.freeze({ id: 'versions.list', argv: ['versions', 'list', '--json'], risk: 'read', output: 'json', description: 'List recent Worker versions.' }),
  Object.freeze({ id: 'versions.view', argv: ['versions', 'view'], risk: 'read', output: 'json', description: 'Read one exact Worker version, including its binding names and types but never secret values.' }),
  Object.freeze({ id: 'types.check', argv: ['types', '--check'], risk: 'read', output: 'text', description: 'Check generated Worker binding/runtime types without rewriting them.' }),
  Object.freeze({ id: 'queues.list', argv: ['queues', 'list'], risk: 'read', output: 'text', description: 'List Workers Queues visible to the active Cloudflare identity.' }),
]);

export const WRANGLER_OPERATION_FAMILIES = Object.freeze([
  Object.freeze({ family: 'identity', examples: ['whoami', 'auth list', 'auth activate'], default_risk: 'read/config' }),
  Object.freeze({ family: 'development', examples: ['dev', 'types --check'], default_risk: 'local-runtime' }),
  Object.freeze({ family: 'observability', examples: ['tail --format json', 'deployments list', 'versions list'], default_risk: 'read/stream' }),
  Object.freeze({ family: 'delivery', examples: ['deploy', 'versions deploy', 'rollback'], default_risk: 'remote-write' }),
  Object.freeze({ family: 'data', examples: ['d1', 'r2', 'kv', 'queues', 'hyperdrive', 'vectorize'], default_risk: 'read-or-remote-write' }),
  Object.freeze({ family: 'compute', examples: ['containers', 'browser', 'ai', 'workflows'], default_risk: 'read-or-remote-write' }),
]);

export function listWranglerNativeCommands() { return WRANGLER_NATIVE_COMMANDS.map((row) => ({ ...row, argv: [...row.argv] })); }

function descriptor(id) {
  const row = WRANGLER_NATIVE_COMMANDS.find((item) => item.id === clean(id));
  if (!row) throw new RangeError(`unsupported_wrangler_native_command:${id}`);
  return row;
}

function resolveConfig(cwd, explicit = '') {
  if (clean(explicit)) {
    const file = path.resolve(cwd, explicit);
    if (!file.startsWith(`${cwd}${path.sep}`) && file !== cwd) throw new Error('cloudflare_config_outside_cwd');
    if (!fs.existsSync(file)) throw new Error(`cloudflare_config_not_found:${explicit}`);
    return file;
  }
  for (const name of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
    const file = path.join(cwd, name);
    if (fs.existsSync(file)) return file;
  }
  return '';
}

export function buildWranglerInvocation(id, input = {}) {
  const row = descriptor(id);
  const cwd = path.resolve(input.cwd || process.cwd());
  const args = [...row.argv];
  if (id === 'whoami' && clean(input.account)) args.push('--account', clean(input.account));
  if ((id === 'deployments.list' || id === 'versions.list') && clean(input.name)) args.push('--name', clean(input.name));
  if (id === 'versions.view') {
    const versionId = clean(input.version_id);
    if (!versionId) throw new Error('cloudflare_version_id_required');
    args.push(versionId, '--json');
    if (clean(input.name)) args.push('--name', clean(input.name));
  }
  if (id === 'types.check' && clean(input.path)) args.splice(1, 0, clean(input.path));
  if (id === 'queues.list' && input.page != null) args.push('--page', String(positiveInteger(input.page, 1)));
  const config = resolveConfig(cwd, input.config);
  if (config) args.push('--config', config);
  if (clean(input.env)) args.push('--env', clean(input.env));
  if (clean(input.profile)) args.push('--profile', clean(input.profile));
  return Object.freeze({ command_id: row.id, command: 'wrangler', args: Object.freeze(args), cwd, risk: row.risk, output: row.output });
}

function parseJsonOutput(text) {
  const source = clean(text);
  if (!source) return null;
  try { return JSON.parse(source); } catch { return null; }
}

function stripAnsi(value) { return String(value || '').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, ''); }
function nestedError(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const rows = [payload.error, ...(Array.isArray(payload.errors) ? payload.errors : [])].filter((row) => row && typeof row === 'object');
  return rows[0] || payload;
}

export function parseWranglerErrorEvidence(stderr = '', stdout = '') {
  const errorText = stripAnsi(stderr);
  const outputText = stripAnsi(stdout);
  let payload = parseJsonOutput(outputText) || parseJsonOutput(errorText);
  const error = nestedError(payload);
  const combined = `${errorText}\n${outputText}`;
  const regexCode = combined.match(/\[code:\s*([A-Za-z0-9_.:-]+)\]/i)?.[1] || combined.match(/\bcode[:=\s]+([A-Za-z0-9_.:-]+)/i)?.[1] || '';
  const code = clean(error?.code || regexCode) || null;
  const requestId = clean(error?.request_id || error?.requestId || combined.match(/\brequest[_ -]?id[:=\s]+([A-Za-z0-9_-]+)/i)?.[1]) || null;
  const rayId = clean(error?.ray_id || error?.rayId || combined.match(/\b(?:cf[- ]?ray|ray id)[:=\s]+([A-Za-z0-9-]+)/i)?.[1]) || null;
  const message = clean(error?.message || error?.error || errorText.split('\n').find((line) => clean(line)) || outputText.split('\n').find((line) => clean(line))) || 'Wrangler operation failed';
  return Object.freeze({ code, request_id: requestId, ray_id: rayId, message, details: payload ? redactDiagnosticValue(payload) : null });
}

export async function runWranglerNative(id, input = {}, options = {}) {
  const plan = buildWranglerInvocation(id, input);
  const runner = options.run || runProcess;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30_000;
  const result = await runner(options.bin || 'npx', ['--yes', 'wrangler', ...plan.args], {
    cwd: plan.cwd,
    timeoutMs,
    signal: options.signal,
    maxBytes: options.maxBytes || 2 * 1024 * 1024,
  });
  if (result.code !== 0) {
    const evidence = parseWranglerErrorEvidence(result.stderr, result.stdout);
    throw new AgentSamDiagnosticError({
      source: 'cloudflare',
      kind: 'wrangler_error',
      code: evidence.code || 'wrangler_exit_nonzero',
      message: evidence.message || `Wrangler ${plan.command_id} exited ${result.code}`,
      retriable: false,
      retry_strategy: 'inspect_error',
      operation: plan.command_id,
      exit_code: result.code,
      request_id: evidence.request_id,
      ray_id: evidence.ray_id,
      cwd: plan.cwd,
      stderr: redactDiagnosticValue(String(result.stderr || '').slice(0, 12_000)) || null,
      stdout: redactDiagnosticValue(String(result.stdout || '').slice(0, 4_000)) || null,
      details: evidence.details,
    });
  }
  const parsed = plan.output === 'json' ? parseJsonOutput(result.stdout) : null;
  return Object.freeze({
    ok: true,
    schema_version: 1,
    command_id: plan.command_id,
    risk: plan.risk,
    cwd: plan.cwd,
    exit_code: result.code,
    format: parsed == null ? 'text' : 'json',
    data: parsed == null ? undefined : redactDiagnosticValue(parsed),
    stdout: parsed == null ? String(result.stdout || '').slice(0, 24_000) : undefined,
    stderr: String(result.stderr || '').slice(0, 8_000) || undefined,
  });
}
