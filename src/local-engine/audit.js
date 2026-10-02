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

function auditLinuxHost(options = {}) {
  const env = options.env || process.env;
  const memory = command('free', ['-b'], options.runner || spawnSync);
  const cpu = command('lscpu', [], options.runner || spawnSync);
  const osRelease = command('uname', ['-a'], options.runner || spawnSync);
  const memoryLine = memory.stdout.split(/\n/).find((line) => /^Mem:/i.test(line));
  const memoryBytes = memoryLine ? Number(memoryLine.trim().split(/\s+/)[1]) || null : null;
  return {
    schema_version: COMPUTE_AUDIT_SCHEMA,
    generated_at: new Date().toISOString(),
    host: { platform: 'linux', arch: options.arch || process.arch, hostname: os.hostname() },
    apple_silicon: false,
    chip: { name: value(cpu.stdout, 'Model name') || value(cpu.stdout, 'Architecture'), family: null, cores: value(cpu.stdout, 'CPU\\(s\\)') },
    memory: { unified_memory_bytes: null, system_memory_bytes: memoryBytes, vram_bytes: null, model: 'system' },
    accelerators: [{ id: 'nvidia-smi', available: Boolean(executable('nvidia-smi', env)), evidence: 'optional' }],
    shells: auditShells(options),
    evidence: [{ source: 'uname', ok: osRelease.ok }, { source: 'lscpu', ok: cpu.ok }, { source: 'free', ok: memory.ok }],
    warnings: ['Linux accelerator memory is engine/vendor-specific and is not inferred as system VRAM.'],
  };
}

function auditWindowsHost(options = {}) {
  const env = options.env || process.env;
  const powershell = executable('pwsh', env) || executable('powershell.exe', env);
  const result = powershell ? command(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$c=Get-CimInstance Win32_ComputerSystem; $g=Get-CimInstance Win32_VideoController; [pscustomobject]@{model=$c.Model;memory=$c.TotalPhysicalMemory;gpu=($g.Name -join ";")}|ConvertTo-Json -Compress'], options.runner || spawnSync) : { ok: false, stdout: '' };
  let facts = {}; try { facts = JSON.parse(result.stdout || '{}'); } catch {}
  return {
    schema_version: COMPUTE_AUDIT_SCHEMA,
    generated_at: new Date().toISOString(),
    host: { platform: 'windows', arch: options.arch || process.arch, hostname: os.hostname() },
    apple_silicon: false,
    chip: { name: facts.model || null, family: null, cores: null },
    memory: { unified_memory_bytes: null, system_memory_bytes: Number(facts.memory) || null, vram_bytes: null, model: 'system' },
    accelerators: [{ id: 'video-controller', available: Boolean(facts.gpu), name: facts.gpu || null }],
    shells: auditShells(options),
    evidence: [{ source: powershell || 'powershell', ok: result.ok }],
    warnings: ['Windows GPU memory is reported only when the vendor API exposes it; no VRAM estimate is made.'],
  };
}

function auditShells(options = {}) {
  const env = options.env || process.env;
  return ['pwsh', 'powershell.exe', 'bash', 'zsh', 'sh'].map((name) => ({ id: name, path: executable(name, env), available: Boolean(executable(name, env)) }));
}

export function auditHost(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'darwin') return { ...auditAppleHost(options), shells: auditShells(options) };
  if (platform === 'win32') return auditWindowsHost(options);
  if (platform === 'linux') return auditLinuxHost(options);
  return { ...parseAppleAudit({ platform, arch: options.arch || process.arch }), shells: auditShells(options) };
}

export function auditLocalCompute(options = {}) {
  return { schema_version: COMPUTE_AUDIT_SCHEMA, generated_at: new Date().toISOString(), hardware: auditHost(options), engines: auditTools(options) };
}
