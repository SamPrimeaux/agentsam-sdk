import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { executable, runCommand } from './runtime.js';

export const COMPUTE_AUDIT_SCHEMA = 'agentsam.compute.audit.v1';

function command(command, args = [], runner = spawnSync) {
  const result = runner(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
  return { ok: result.status === 0, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim(), status: result.status };
}

function value(text, key) {
  const match = String(text || '').match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
  return match?.[1]?.trim() || null;
}

function bytes(valueText) {
  const n = Number(valueText);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const match = String(valueText || '').match(/([\d.]+)\s*(GB|TB|MB)/i);
  if (!match) return null;
  const factor = { mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 }[match[2].toLowerCase()];
  return Math.floor(Number(match[1]) * factor);
}

export function parseSystemProfilerHardware(text) {
  const chip = text.match(/Chip:\s*(.+)/i)?.[1]?.trim() || text.match(/Processor Name:\s*(.+)/i)?.[1]?.trim() || null;
  const memory = text.match(/Memory:\s*(.+)/i)?.[1]?.trim() || null;
  const cores = text.match(/Total Number of Cores:\s*(.+)/i)?.[1]?.trim() || null;
  return { chip, unified_memory_bytes: bytes(memory), core_summary: cores };
}

export function parseAppleAudit({ sysctlText = '', profilerText = '', platform = process.platform, arch = process.arch } = {}) {
  const hardware = parseSystemProfilerHardware(profilerText);
  const chip = hardware.chip || value(sysctlText, 'machdep.cpu.brand_string') || value(sysctlText, 'hw.model');
  const memory = hardware.unified_memory_bytes || bytes(value(sysctlText, 'hw.memsize'));
  const appleSilicon = platform === 'darwin' && (arch === 'arm64' || /apple\s*m[1-9]/i.test(chip || ''));
  return {
    schema_version: COMPUTE_AUDIT_SCHEMA,
    generated_at: new Date().toISOString(),
    host: { platform, arch, hostname: os.hostname() },
    apple_silicon: appleSilicon,
    chip: { name: chip, family: chip?.match(/Apple\s+(M\d[^ ]*)/i)?.[1] || null, cores: hardware.core_summary },
    memory: { unified_memory_bytes: memory, vram_bytes: null, model: appleSilicon ? 'unified' : 'unknown' },
    metal: { available: appleSilicon ? null : false, features: [], evidence: appleSilicon ? 'not_probed' : 'non_apple_host' },
    evidence: [],
    warnings: appleSilicon ? ['Metal feature probing requires the macOS native helper and is not inferred from chip identity.'] : ['Apple Silicon audit is unavailable on this host.'],
  };
}

export function auditAppleHost(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (platform !== 'darwin') return parseAppleAudit({ platform, arch });
  const sysctl = command('sysctl', ['-n', 'hw.model', 'hw.memsize'], options.runner || spawnSync);
  const profiler = command('system_profiler', ['SPHardwareDataType', 'SPDisplaysDataType'], options.runner || spawnSync);
  const audit = parseAppleAudit({ sysctlText: sysctl.stdout, profilerText: profiler.stdout, platform, arch });
  audit.evidence.push({ source: 'sysctl', ok: sysctl.ok });
  audit.evidence.push({ source: 'system_profiler', ok: profiler.ok });
  audit.host.env_override = Boolean(env.AGENTSAM_HOME);
  return audit;
}

export function auditTools(options = {}) {
  const engines = [
    { id: 'ollama', commands: ['ollama'] },
    { id: 'llama.cpp', commands: ['llama-server', 'llama-cli'] },
    { id: 'mlx-lm', commands: ['mlx_lm.server', 'mlx_lm'] },
  ];
  return engines.map((engine) => {
    const hits = engine.commands.map((name) => ({ name, path: executable(name, options.env || process.env) })).filter((row) => row.path);
    const version = hits[0] ? runCommand(hits[0].name, ['--version'], options).stdout.trim() : null;
    return { engine_id: engine.id, installed: hits.length > 0, commands: hits, version: version || null };
  });
}

export function auditLocalCompute(options = {}) {
  return { schema_version: COMPUTE_AUDIT_SCHEMA, generated_at: new Date().toISOString(), hardware: auditAppleHost(options), engines: auditTools(options) };
}
