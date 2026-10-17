import { createHash } from 'node:crypto';
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

// A saved grant must never authorize a different file, resource, script,
// or command argument. Canonicalize input so JSON property order is immaterial.
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  }
  return value;
}
function exactKey(id,input) {
  const payload=JSON.stringify(canonical(input??{}));
  const digest=createHash('sha256').update(payload).digest('hex').slice(0,24);
  return `${id}:${digest}`;
}

export function toolApprovalKey(capabilityId, input = {}) {
  const id = clean(capabilityId);
  const command = clean(input?.command);
  if (id === 'cloudflare.wrangler.native' && /^[A-Za-z0-9._-]+$/.test(command) &&
      Object.keys(input??{}).every(k=>k==='command'))return `${id}:${command}`;
  if (id === 'terminal.exec' && /^[A-Za-z0-9._+-]+$/.test(command) &&
      Object.keys(input??{}).every(k=>k==='command'))return `${id}:${command}`;
  if (id === 'sam.superbash') {
    // Always-allow applies to one script/artifact and relative cwd, not
    // to arbitrary future shell commands.
    const source = typeof input?.script === 'string' ? input.script : String(input?.scriptArtifactRef || '');
    const cwd = String(input?.relativeCwd || '.');
    const digest = createHash('sha256').update(source + '\0' + cwd).digest('hex').slice(0, 24);
    return 'sam.superbash:' + digest;
  }
  return exactKey(id,input);
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
