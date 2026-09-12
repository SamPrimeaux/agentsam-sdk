import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA = 'agentsam-execution-approvals-v1';

function clean(value) { return value == null ? '' : String(value).trim(); }
function homeDirectory(options = {}) { return path.resolve(clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir()); }
function approvalsPath(options = {}) { return path.join(homeDirectory(options), '.agentsam', 'execution-approvals.json'); }

function readStore(options = {}) {
  const filename = approvalsPath(options);
  if (!fs.existsSync(filename)) return { schema_version: SCHEMA, approvals: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (parsed?.schema_version !== SCHEMA || !Array.isArray(parsed.approvals)) return { schema_version: SCHEMA, approvals: [] };
    return parsed;
  } catch { return { schema_version: SCHEMA, approvals: [] }; }
}

function writeStore(store, options = {}) {
  const filename = approvalsPath(options);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fs.chmodSync(temp, 0o600); } catch { /* best effort */ }
  }
  fs.renameSync(temp, filename);
}

export function toolApprovalKey(capabilityId, input = {}) {
  const id = clean(capabilityId);
  const command = clean(input?.command);
  if (id === 'cloudflare.wrangler.native' && /^[A-Za-z0-9._-]+$/.test(command)) return `${id}:${command}`;
  return id;
}

export function isExecutionApproved({ cwd, key }, options = {}) {
  const root = path.resolve(clean(cwd) || process.cwd());
  const target = clean(key);
  if (!target) return false;
  return readStore(options).approvals.some((row) => row?.cwd === root && row?.key === target);
}

export function grantExecutionApproval({ cwd, key, label = '' }, options = {}) {
  const root = path.resolve(clean(cwd) || process.cwd());
  const target = clean(key);
  if (!target) throw new Error('execution_approval_key_required');
  const store = readStore(options);
  const approvals = store.approvals.filter((row) => !(row?.cwd === root && row?.key === target));
  approvals.push({ cwd: root, key: target, label: clean(label) || target, created_at: new Date().toISOString() });
  writeStore({ schema_version: SCHEMA, approvals }, options);
  return { cwd: root, key: target, persisted: true };
}

export function listExecutionApprovals(options = {}) {
  return readStore(options).approvals.map((row) => ({ ...row }));
}
