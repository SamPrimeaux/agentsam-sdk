import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';

export const PROJECT_CONFIG_PATH = '.agentsam/config.json';
export const PROJECT_CONFIG_SCHEMA_VERSION = 2;

function providerForHost(host) {
  const value = String(host || '').toLowerCase();
  if (value === 'github.com') return 'github';
  if (value === 'gitlab.com') return 'gitlab';
  if (value === 'bitbucket.org') return 'bitbucket';
  return value ? 'git' : null;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function portableRepositoryIdFromGit(cwd = process.cwd()) {
  const git = tryResolveGitContext({ cwd });
  if (!git) return null;
  const provider = providerForHost(git.remoteHost);
  if (!provider || !git.repoFullName) return null;
  const fullName = provider === 'github' ? git.repoFullName.toLowerCase() : git.repoFullName;
  return `${provider}:${fullName}`;
}

export function newLocalRepositoryId() {
  return `local:${randomUUID()}`;
}

export function createProjectManifest({
  projectName,
  preset = null,
  profile = 'default',
  runTarget = 'local',
  sdkVersion = null,
  repositoryId = null,
  repositoryRemote = 'origin',
} = {}) {
  const name = clean(projectName);
  if (!name) throw new Error('project_name_required');
  const repoId = clean(repositoryId) || newLocalRepositoryId();
  const target = clean(runTarget) || 'local';
  return {
    schema_version: PROJECT_CONFIG_SCHEMA_VERSION,
    project: {
      name,
    },
    repository: {
      id: repoId,
      remote: clean(repositoryRemote) || 'origin',
    },
    product: {
      preset: preset ? clean(preset) : null,
      features: [],
      capabilities: [],
    },
    defaults: {
      mode: 'agent',
      profile: clean(profile) || 'default',
      runtime: 'local',
      model: 'auto',
      deploy_target: target === 'local' ? null : target,
    },
    merkle: {
      enabled: true,
      semantic: true,
      persistence: 'auto',
    },
    rules: {
      file: '.agentsamrules',
    },
    knowledge: {
      config: '.agentsam/knowledge.json',
    },
    // Project-owned plugin/resource declarations. Bindings, indexes, models,
    // and dimensions belong here rather than in a global SDK default.
    plugins: {},
    local: {
      database: '.agentsam/data/agentsam.sqlite',
      schema: 'db/schema.sql',
    },
    sdk: {
      created_with: sdkVersion || null,
    },
  };
}

export function projectConfigPath(root) {
  return path.join(path.resolve(root), PROJECT_CONFIG_PATH);
}

export function readProjectConfig(root) {
  return JSON.parse(fs.readFileSync(projectConfigPath(root), 'utf8'));
}

export function tryReadProjectConfig(root) {
  try {
    return readProjectConfig(root);
  } catch {
    return null;
  }
}

export function writeProjectConfig(root, config) {
  const filename = projectConfigPath(root);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return filename;
}

export function isProjectManifestV2(config) {
  return Number(config?.schema_version) === PROJECT_CONFIG_SCHEMA_VERSION && Boolean(config?.project?.name);
}

// Accessors deliberately understand the old flat scaffold so existing projects keep working
// while new projects use the committed portable v2 manifest.
export function getProjectName(config, fallback = '') {
  return clean(config?.project?.name || config?.project || fallback);
}

export function getProjectPreset(config) {
  return clean(config?.product?.preset || config?.preset || config?.lane) || null;
}

export function getDefaultProfile(config) {
  return clean(config?.defaults?.profile || config?.agent) || 'default';
}

export function getDefaultRuntime(config) {
  return clean(config?.defaults?.runtime || config?.run_target) || 'local';
}

export function getDefaultModel(config) {
  return clean(config?.defaults?.model) || 'auto';
}

export function getDeployTarget(config) {
  return clean(config?.defaults?.deploy_target || config?.deploy_target) || null;
}

export function getRepositoryId(config) {
  return clean(config?.repository?.id) || null;
}

export function getProjectRulesPath(config) {
  return clean(config?.rules?.file) || '.agentsamrules';
}

export function getKnowledgeConfigPath(config) {
  return clean(config?.knowledge?.config) || '.agentsam/knowledge.json';
}

export function getProjectPluginConfig(config, pluginKey) {
  const key = clean(pluginKey).replace(/^@/, '');
  const plugins = config?.plugins || config?.integrations || {};
  return plugins[key] || plugins[`@${key}`] || null;
}

export function getLocalDatabasePath(config) {
  return clean(config?.local?.database || config?.db_path) || '.agentsam/data/agentsam.sqlite';
}

export function getLocalSchemaPath(config) {
  return clean(config?.local?.schema || config?.db_schema) || 'db/schema.sql';
}

export function getCreatedWithVersion(config) {
  return clean(config?.sdk?.created_with || config?.scaffold_version) || null;
}

export function setDeployTarget(config, target) {
  const value = clean(target) || null;
  if (isProjectManifestV2(config)) {
    config.defaults ||= {};
    config.defaults.deploy_target = value;
  } else {
    config.deploy_target = value;
  }
  return config;
}

export function setProductPreset(config, preset) {
  if (isProjectManifestV2(config)) {
    config.product ||= { preset: null, features: [], capabilities: [] };
    config.product.preset = clean(preset?.id) || null;
    config.product.features = [...(preset?.features || [])];
    config.product.capabilities = [...(preset?.capabilities || [])];
  } else {
    config.preset = clean(preset?.id) || null;
    config.features = [...(preset?.features || [])];
    config.capabilities = [...(preset?.capabilities || [])];
  }
  return config;
}

export function setLocalModelCapability(config, provider = 'ollama') {
  if (isProjectManifestV2(config)) {
    config.models ||= { default: getDefaultModel(config) };
    config.models.local = {
      provider,
      base_url_env: 'OLLAMA_BASE_URL',
      model_env: 'OLLAMA_MODEL',
      embed_model_env: 'OLLAMA_EMBED_MODEL',
    };
  } else {
    config.local_model = {
      provider,
      local_only: true,
      base_url_env: 'OLLAMA_BASE_URL',
      model_env: 'OLLAMA_MODEL',
      embed_model_env: 'OLLAMA_EMBED_MODEL',
    };
  }
  return config;
}

export function ensureProjectManifest(root, options = {}) {
  const existing = tryReadProjectConfig(root);
  if (existing) return existing;
  const gitId = portableRepositoryIdFromGit(root);
  const manifest = createProjectManifest({
    projectName: options.projectName || path.basename(path.resolve(root)),
    preset: options.preset ?? null,
    profile: options.profile || 'default',
    runTarget: options.runTarget || 'local',
    sdkVersion: options.sdkVersion || null,
    repositoryId: options.repositoryId || gitId || newLocalRepositoryId(),
    repositoryRemote: options.repositoryRemote || 'origin',
  });
  writeProjectConfig(root, manifest);
  return manifest;
}
