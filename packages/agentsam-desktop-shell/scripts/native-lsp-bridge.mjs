/**
 * Local Studio native LSP IPC. Tauri is the only caller; no localhost server,
 * no arbitrary command executor, no Cloudflare or agent keys.
 * Reuses the portable agentsam-ide LspHost unchanged.
 */
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { LspHost, LANGUAGE_EXECUTABLES } from './host.mjs';

const hosts = new Map();
const sessions = new Map();
const MAX_WORKSPACES = 8;

function ensureRoot(input) {
  const value = String(input || '').trim();
  if (!value || !path.isAbsolute(value)) throw new Error('lsp_absolute_workspace_required');
  const root = fs.realpathSync(value);
  if (!fs.statSync(root).isDirectory()) throw new Error('lsp_workspace_not_directory');
  return root;
}
function hostFor(root) {
  if (hosts.has(root)) return hosts.get(root);
  if (hosts.size >= MAX_WORKSPACES) throw new Error('lsp_workspace_limit');
  const host = new LspHost({ root, maxSessions: 10, maxMessages: 80 });
  hosts.set(root, host);
  return host;
}
function handle(req) {
  const action = String(req?.action || '').trim();
  if (!['capabilities', 'start', 'send', 'poll', 'stop'].includes(action)) {
    throw new Error('lsp_action_not_supported');
  }
  if (action === 'capabilities') {
    const root = ensureRoot(req.workspace_root);
    return { ok: true, workspace_root: root, capabilities: hostFor(root).capabilities() };
  }
  if (action === 'start') {
    const root = ensureRoot(req.workspace_root);
    const language = String(req.language || '');
    if (!Object.hasOwn(LANGUAGE_EXECUTABLES, language)) throw new Error('lsp_unsupported_language');
    const host = hostFor(root);
    const result = host.start(language);
    if (result.ok) sessions.set(result.session_id, host);
    return result;
  }
  const sessionId = String(req?.session_id || '');
  const host = sessions.get(sessionId);
  if (!host) throw new Error('lsp_unknown_session');
  if (action === 'send') return host.send(sessionId, req.message);
  if (action === 'poll') return host.poll(sessionId, Number(req.after || 0));
  if (action === 'stop') {
    sessions.delete(sessionId);
    return host.stop(sessionId);
  }
  throw new Error('lsp_action_not_supported');
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    const result = handle(request);
    const encoded = JSON.stringify(result);
    if (Buffer.byteLength(encoded) > 4_000_000) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'lsp_poll_response_too_large' }) + '\n');
    } else {
      process.stdout.write(encoded + '\n');
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error?.message || 'lsp_request_failed' }) + '\n');
  }
});
const cleanup = () => { for (const host of hosts.values()) host.close(); };
input.on('close', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
