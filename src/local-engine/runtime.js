import { spawnSync } from 'node:child_process';
import { engineError } from './contracts.js';

export function executable(command, env = process.env) {
  if (!command) return null;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env });
  return result.status === 0 ? String(result.stdout || '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) || null : null;
}

export function runCommand(command, args = [], options = {}) {
  const binary = options.binary || executable(command, options.env || process.env);
  if (!binary) return { ok: false, installed: false, command, args, stdout: '', stderr: '', status: null };
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    env: options.env || process.env,
    timeout: options.timeout || 3000,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
  });
  return { ok: result.status === 0, installed: true, command, args, binary, stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), status: result.status, error: result.error || null };
}

export async function fetchJson(url, init = {}, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { ...init, signal: init.signal || AbortSignal.timeout(3000) });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) return { ok: false, status: response.status, body, error: `HTTP ${response.status}` };
    return { ok: true, status: response.status, body };
  } catch (error) {
    return { ok: false, status: null, body: null, error: error?.message || String(error) };
  }
}

export function unsupported(engineId, operation) {
  return engineError('LOCAL_ENGINE_UNSUPPORTED', `${engineId} does not support ${operation}`, { engine_id: engineId, operation });
}
