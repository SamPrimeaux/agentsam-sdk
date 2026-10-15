/**
 * Versioned, actor/account/installation-scoped local script artifacts.
 * Uses ~/.agentsam/scripts by default, never a separate CMS/database.
 * Updates are optimistic and serialized per script; stored versions are immutable.
 */
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';

const sha = value => createHash('sha256').update(value).digest('hex');
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SCRIPT_ID = /^sc_[a-f0-9]{32}$/;
const SOURCE_MAX_BYTES = 200_000;
const safeId = (value, label) => {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error(label === 'scriptId' ? 'script_id_invalid' : 'script_' + label + '_invalid');
  return value;
};
async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
const artifactRefFor = item => 'sam-script/' + item.scriptId + '/v' + item.version + '/' + item.sha256;

export function createLocalScriptStore({ home = os.homedir(), root = path.join(home, '.agentsam', 'scripts') } = {}) {
  if (!path.isAbsolute(root)) throw new Error('script_store_root_must_be_absolute');
  const base = path.resolve(root);
  function scriptDir({ accountId, actorId, installationId, scriptId }) {
    for (const [key, value] of Object.entries({ accountId, actorId, installationId, scriptId })) safeId(value, key);
    if (!SCRIPT_ID.test(scriptId)) throw new Error('script_id_invalid');
    return path.join(base, accountId, actorId, installationId, scriptId);
  }
  async function ensureDirectory(dir) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Do not follow a malicious symlink substituted at the leaf.
    if (!(await lstat(dir)).isDirectory()) throw new Error('script_store_directory_invalid');
  }
  async function getVersion({ accountId, actorId, installationId, scriptId, version = null }) {
    const dir = scriptDir({ accountId, actorId, installationId, scriptId });
    const head = await readJson(path.join(dir, 'head.json'));
    if (!head) return null;
    const resolvedVersion = version == null ? head.version : version;
    if (!Number.isSafeInteger(resolvedVersion) || resolvedVersion < 1 || resolvedVersion > head.version) return null;
    const record = await readJson(path.join(dir, 'v' + resolvedVersion + '.json'));
    if (!record) return null;
    if (record.accountId !== accountId || record.actorId !== actorId ||
      record.installationId !== installationId || record.scriptId !== scriptId ||
      record.version !== resolvedVersion || sha(record.script) !== record.sha256 ||
      record.artifactRef !== artifactRefFor(record)) throw new Error('script_integrity_or_scope_mismatch');
    return record;
  }
  async function saveVersion({
    accountId, actorId, installationId, scriptId = null,
    expectedVersion = null, script, description = null,
  }) {
    if (typeof script !== 'string' || !script.trim() ||
      Buffer.byteLength(script, 'utf8') > SOURCE_MAX_BYTES || script.includes('\0')) {
      throw new Error('script_source_invalid');
    }
    const id = scriptId == null ? 'sc_' + randomUUID().replaceAll('-', '') : scriptId;
    const dir = scriptDir({ accountId, actorId, installationId, scriptId: id });
    await ensureDirectory(dir);
    const lock = path.join(dir, 'write.lock');
    let guard;
    try { guard = await open(lock, 'wx', 0o600); }
    catch (error) {
      if (error?.code === 'EEXIST') throw new Error('script_store_busy');
      throw error;
    }
    try {
      const head = await readJson(path.join(dir, 'head.json'));
      if (head && (!Number.isSafeInteger(expectedVersion) || expectedVersion !== head.version)) {
        throw new Error('script_version_conflict');
      }
      if (!head && expectedVersion != null) throw new Error('script_version_conflict');
      const version = (head?.version || 0) + 1;
      const item = {
        scriptId: id, version, accountId, actorId, installationId,
        script, description: description == null ? null : String(description).slice(0, 500),
        sha256: sha(script), createdAt: new Date().toISOString(),
      };
      item.artifactRef = artifactRefFor(item);
      const versionFile = path.join(dir, 'v' + version + '.json');
      await writeFile(versionFile, JSON.stringify(item), { flag: 'wx', mode: 0o600 });
      const temp = path.join(dir, 'head.' + randomUUID() + '.tmp');
      try {
        await writeFile(temp, JSON.stringify({ version, sha256: item.sha256 }), { flag: 'wx', mode: 0o600 });
        await rename(temp, path.join(dir, 'head.json'));
      } finally { await rm(temp, { force: true }); }
      return { scriptId: id, version, artifactRef: item.artifactRef, sha256: item.sha256 };
    } finally {
      await guard.close();
      await rm(lock, { force: true });
    }
  }
  async function getByArtifactRef({ accountId, actorId, installationId, artifactRef }) {
    const match = /^sam-script\/(sc_[a-f0-9]{32})\/v([1-9]\d*)\/([a-f0-9]{64})$/.exec(String(artifactRef || ''));
    if (!match) return null;
    const item = await getVersion({ accountId, actorId, installationId, scriptId: match[1], version: Number(match[2]) });
    return item?.sha256 === match[3] ? item : null;
  }
  return Object.freeze({ saveVersion, getVersion, getByArtifactRef });
}
