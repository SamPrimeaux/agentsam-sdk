import fs from 'node:fs';
import path from 'node:path';
import { readCloudflareDeploymentContract } from '../cloudflare/runtime-status.js';
import { getRepositoryId, portableRepositoryIdFromGit, tryReadProjectConfig } from '../lib/project-config.js';
import { resolveProviderCredential } from '../lib/provider-credentials.js';
import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';

export const PROJECT_CONTEXT_SCHEMA = 'agentsam.project-context.v1';
const clean = value => value == null ? '' : String(value).trim();
const localIndexPath = root => path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
function readJson(filename) { try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return null; } }
function executionState({ observed = false, selected = false, local = false, remote = false, conflicting = false, source = null, reason = null } = {}) {
  return { observed: Boolean(observed), explicitly_selected: Boolean(selected), locally_executable: Boolean(local), remotely_executable: Boolean(remote), missing: !observed, conflicting: Boolean(conflicting), source: source || null, reason: reason || null };
}
function cloudflareCredentialState(env) {
  try {
    const credential = resolveProviderCredential('cloudflare', { env });
    const configured = Boolean(credential?.configured);
    const accountResolved = Boolean(clean(credential?.account_id));
    return { configured, account_resolved: accountResolved, executable: configured && accountResolved, source: credential?.source || null, error: credential?.error || (!configured ? 'cloudflare_authorization_required' : !accountResolved ? 'cloudflare_account_id_required' : null) };
  } catch (error) {
    return { configured: false, account_resolved: false, executable: false, source: null, error: error?.message || String(error) };
  }
}
function policyConflict(policy, vectorize) {
  if (policy?.lane?.backend !== 'cloudflare_vectorize') return [];
  const binding = clean(policy.lane.binding), index = clean(policy.lane.index);
  if (vectorize.some(row => row.binding === binding && row.index === index)) return [];
  return [{ kind: 'knowledge_deployment_drift', backend: 'cloudflare_vectorize', policy: { binding: binding || null, index: index || null }, observed: vectorize.map(row => ({ binding: row.binding, index: row.index })), detail: 'Knowledge policy selects a Vectorize binding/index that is not declared by the active Wrangler deployment contract.' }];
}

export function discoverProjectContext(root = process.cwd(), options = {}) {
  const resolvedRoot = fs.realpathSync(path.resolve(root));
  const env = options.env || process.env;
  const policy = options.knowledgeConfig || null;
  const projectConfig = options.projectConfig || tryReadProjectConfig(resolvedRoot);
  const git = tryResolveGitContext({ cwd: resolvedRoot });
  const repositoryId = getRepositoryId(projectConfig) || portableRepositoryIdFromGit(resolvedRoot) || `local:${path.basename(resolvedRoot)}`;
  const hostInstallPath = path.join(resolvedRoot, '.agentsam', 'app.json');
  const hostInstall = fs.existsSync(hostInstallPath) ? readJson(hostInstallPath) : null;
  const productManifestPath = path.join(resolvedRoot, 'agentsam.app.json');
  const productManifest = fs.existsSync(productManifestPath) ? readJson(productManifestPath) : null;
  let contract = null, contractError = null;
  try { contract = readCloudflareDeploymentContract(resolvedRoot, projectConfig || {}); } catch (error) { contractError = error?.message || String(error); }
  const bindings = contract?.bindings || [];
  const ai = bindings.find(row => row.type === 'ai') || null;
  const vectorize = bindings.filter(row => row.type === 'vectorize').map(row => ({ binding: row.name, index: row.index_name || null, source: row.source || 'wrangler_config' }));
  const d1 = bindings.filter(row => row.type === 'd1');
  const r2 = bindings.filter(row => row.type === 'r2_bucket');
  const credential = cloudflareCredentialState(env);
  const remoteConfigured = Boolean(contract?.configured);
  const conflicts = policyConflict(policy, vectorize);
  const indexPath = localIndexPath(resolvedRoot);
  const localIndex = { exists: fs.existsSync(indexPath), path: path.relative(resolvedRoot, indexPath) };
  const policyBinding = clean(policy?.lane?.binding), policyIndex = clean(policy?.lane?.index);
  const vectorizeResources = vectorize.map(row => {
    const selected = policy?.lane?.backend === 'cloudflare_vectorize' && row.binding === policyBinding && row.index === policyIndex;
    return {
      ...row,
      configured: Boolean(row.binding && row.index),
      ...executionState({
        observed: Boolean(row.binding && row.index), selected,
        local: Boolean(row.binding && row.index && credential.executable),
        remote: Boolean(row.binding && row.index && remoteConfigured),
        conflicting: conflicts.length > 0 && !selected,
        source: row.source,
        reason: credential.executable ? null : 'Local CLI/Desktop Vectorize execution requires the current user Cloudflare authorization and account id.',
      }),
    };
  });
  const workersAi = ai ? {
    binding: ai.name, configured: true, credential_state: credential,
    ...executionState({ observed: true, selected: policy?.embedding?.provider === 'workers-ai', local: false, remote: remoteConfigured, source: ai.source || 'wrangler_config', reason: 'Workers AI binding is executable in the configured Worker runtime; a local Node process does not possess env.<AI_BINDING>.' }),
  } : {
    binding: null, configured: false, credential_state: credential,
    ...executionState({ observed: false, source: contract?.config || null, reason: 'No Workers AI binding declared.' }),
  };
  const mapBoundResource = row => ({
    binding: row.name,
    name: row.database_name || row.bucket_name || null,
    id: row.database_id || null,
    ...executionState({ observed: true, local: false, remote: remoteConfigured, source: row.source || 'wrangler_config', reason: 'This receipt describes runtime binding execution; local provider API execution is a separate authorized transport.' }),
  });
  const lanes = [];
  if (localIndex.exists) lanes.push({ id: 'local-index', backend: 'local_exact', source: 'local_index', configured: true, locally_executable: true, remotely_executable: false });
  for (const row of vectorizeResources) lanes.push({ id: `cloudflare-vectorize:${row.binding}`, backend: 'cloudflare_vectorize', binding: row.binding, index: row.index, source: row.source, configured: row.configured, locally_executable: row.locally_executable, remotely_executable: row.remotely_executable, explicitly_selected: row.explicitly_selected, conflicting: row.conflicting });

  return {
    schema: PROJECT_CONTEXT_SCHEMA,
    version: 1,
    repository: { root: resolvedRoot, identity: repositoryId, branch: git?.branch || null, revision: git?.revisionSha || null, dirty: git?.dirty ?? null, source: git ? 'git' : projectConfig ? '.agentsam/config.json' : 'filesystem' },
    project: {
      config_present: Boolean(projectConfig), config_source: projectConfig ? '.agentsam/config.json' : null,
      product_manifest: productManifest ? { id: clean(productManifest.id) || null, source: 'agentsam.app.json' } : null,
      host_install: hostInstall ? { app_id: clean(hostInstall.app_id || hostInstall.id) || null, name: clean(hostInstall.name) || null, role: clean(hostInstall.role) || null, mounts: hostInstall.mounts || null, schema: clean(hostInstall.schema) || null, source: '.agentsam/app.json' } : null,
    },
    deployment: { configured: remoteConfigured, worker_name: contract?.worker_name || null, config: contract?.config || null, error: contractError },
    knowledge: {
      policy_configured: Boolean(policy), policy_source: policy ? '.agentsam/knowledge.json' : null,
      selected_backend: policy?.lane?.backend || null,
      suggested_backend: !policy && vectorizeResources.length === 1 ? 'cloudflare_vectorize' : (!policy ? 'local_exact' : null),
      local_index: { ...localIndex, ...executionState({ observed: localIndex.exists, selected: policy?.lane?.backend === 'local_exact', local: localIndex.exists, remote: false, source: localIndex.exists ? localIndex.path : null, reason: localIndex.exists ? null : 'No local knowledge SQLite index exists.' }) },
    },
    authorization: { cloudflare: credential },
    resources: {
      workers_ai: workersAi,
      vectorize: vectorizeResources,
      d1: d1.map(mapBoundResource),
      r2: r2.map(mapBoundResource),
    },
    conflicts,
    local_index: localIndex,
    cloudflare: {
      configured: remoteConfigured,
      worker_name: contract?.worker_name || null,
      config: contract?.config || null,
      ai_binding: ai?.name || null,
      vectorize: vectorizeResources.map(row => ({ binding: row.binding, index: row.index, source: row.source })),
      error: contractError,
    },
    lanes,
  };
}

export function discoverKnowledgeRuntime(root = process.cwd(), options = {}) {
  return discoverProjectContext(root, options);
}
