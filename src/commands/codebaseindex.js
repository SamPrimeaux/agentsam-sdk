/**
 * agentsam codebaseindex | ingest — guided SAM primitive for indexing materials.
 * Pipeline authority: sam.codebaseindex.index.run (IAM host) · local: knowledge index run.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  cancel, confirm, intro, isCancel, note, outro, select, text,
} from '@clack/prompts';
import pc from 'picocolors';
import {
  CONFIG_PATH, repositoryRoot, readConfig, defaultConfig, validateConfig,
} from '../knowledge/config.js';
import { openSqliteStore } from '../knowledge/stores/sqlite.js';
import { openPostgresStore } from '../knowledge/stores/postgres.js';
import { planIndex, runIndex } from '../knowledge/engine.js';
import { createProviderRegistry } from '../../packages/agentsam-knowledge/src/providers/index.js';
import { ensureProjectManifest, getRepositoryId, portableRepositoryIdFromGit, tryReadProjectConfig } from '../lib/project-config.js';
import { parsePastedPaths, stageMaterials } from '../lib/ingest/materials.js';
import {
  discoverIngestModelOptions,
  parseEmbeddingChoice,
  suggestScopeWithLocalModel,
} from '../lib/ingest/discover-models.js';

function pick(value, label = 'Cancelled') {
  if (isCancel(value)) {
    cancel(label);
    const err = new Error('codebaseindex_cancelled');
    err.code = 'AGENTSAM_CODEBASEINDEX_CANCELLED';
    throw err;
  }
  return value;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function listTopLevel(root) {
  try {
    return fs.readdirSync(root).filter((name) => !name.startsWith('.git'));
  } catch {
    return [];
  }
}

function localSqlitePath(root) {
  return path.join(root, '.agentsam', 'knowledge', 'index.sqlite');
}

async function openStore(root, config, readOnly = false) {
  if (config.storage.driver === 'sqlite') {
    return openSqliteStore(localSqlitePath(root), { readOnly });
  }
  return openPostgresStore(process.env[config.storage.connection_env]);
}

function writeKnowledgeConfig(root, config) {
  const validated = validateConfig(config);
  const target = path.join(root, CONFIG_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
  return validated;
}

function loadOrBuildConfig(root, preferences) {
  const project = tryReadProjectConfig(root) || ensureProjectManifest(root, {});
  const repositoryId = getRepositoryId(project) || portableRepositoryIdFromGit(root) || preferences.repositoryId;
  const filename = path.join(root, CONFIG_PATH);
  const base = fs.existsSync(filename)
    ? readConfig(root)
    : defaultConfig({
      include: preferences.include,
      exclude: preferences.exclude,
      scope: preferences.scopeName || 'default',
      target: preferences.storage === 'postgres' ? 'production' : 'local',
      dimensions: preferences.embedding.dimensions || 768,
      repositoryId,
    });

  return writeKnowledgeConfig(root, {
    ...base,
    repository_id: base.repository_id || repositoryId,
    scope: {
      name: preferences.scopeName || base.scope?.name || 'default',
      include: preferences.include,
      exclude: preferences.exclude,
    },
    embedding: preferences.embedding.provider === 'none'
      ? { provider: 'none', model: 'none', revision: '1', dimensions: 0, parameters: {} }
      : { ...base.embedding, ...preferences.embedding },
    storage: preferences.storage === 'postgres'
      ? { driver: 'postgres', connection_env: preferences.connectionEnv || 'AGENTSAM_DATABASE_URL' }
      : { driver: 'sqlite' },
    lane: {
      id: `${preferences.scopeName || 'default'}-ingest`,
      backend: preferences.storage === 'postgres' ? 'postgres_pgvector' : 'local_exact',
      resource: null,
      binding: null,
      index: null,
      metric: 'cosine',
    },
  });
}

function providerAdapter(profile) {
  if (profile?.provider === 'none') {
    return {
      validate: () => {},
      embed: async () => {
        throw new Error('embedding_disabled');
      },
    };
  }
  const adapter = createProviderRegistry().get(profile.provider);
  return {
    validate: (input) => adapter.validate(input),
    async embed(text, input, context) {
      return context?.kind === 'query'
        ? adapter.embedQuery(text, input, context)
        : (await adapter.embedDocuments([text], input, context))[0];
    },
  };
}

/**
 * Non-interactive / SAM handler entry.
 * @param {object} input
 * @param {object} [ctx]
 */
export async function runCodebaseindexIngest(input = {}, ctx = {}) {
  const root = path.resolve(input.root || input.cwd || ctx.cwd || process.cwd());
  const materials = Array.isArray(input.materials)
    ? input.materials
    : parsePastedPaths(input.paste || input.paths || '');
  let include = Array.isArray(input.include) && input.include.length ? [...input.include] : ['.'];
  // Exclude is user-authored — never invent a product denylist.
  let exclude = Array.isArray(input.exclude) ? [...input.exclude] : [];
  /** @type {object|null} */
  let staged = null;

  if (materials.length) {
    staged = stageMaterials({ root, materials });
    include = [...new Set([...include.filter((x) => x !== '.'), ...staged.include])];
    if (!include.length) include = staged.include.length ? staged.include : ['.'];
  }

  const embedding = input.embedding && typeof input.embedding === 'object'
    ? input.embedding
    : parseEmbeddingChoice(input.embeddingChoice || 'none');

  const storage = input.storage === 'postgres' ? 'postgres' : 'sqlite';
  const config = loadOrBuildConfig(root, {
    include,
    exclude,
    embedding,
    storage,
    scopeName: input.scope || 'ingest',
    connectionEnv: input.connectionEnv,
  });

  const embed = Boolean(input.embed) && embedding.provider !== 'none';
  const store = await openStore(root, config, false);
  try {
    if (input.planOnly) {
      const plan = await planIndex({ root, config, store, embed });
      return {
        pipeline: 'sam.codebaseindex.index.run',
        operation: 'codebaseindex.ingest',
        mode: 'plan',
        root,
        config_path: CONFIG_PATH,
        staged,
        plan: plan.receipt,
        embedding: config.embedding,
        storage: config.storage,
        include: config.scope.include,
        exclude: config.scope.exclude,
      };
    }

    let adapter;
    const embedder = {
      validate: (...args) => (adapter ??= providerAdapter(config.embedding)).validate(...args),
      embed: (...args) => (adapter ??= providerAdapter(config.embedding)).embed(...args),
    };
    const result = await runIndex({
      root,
      config,
      store,
      embed,
      embedder,
      maxInputs: Number(input.maxInputs ?? 200),
      maxCharacters: Number(input.maxCharacters ?? 400000),
    });
    return {
      pipeline: 'sam.codebaseindex.index.run',
      operation: 'codebaseindex.ingest',
      mode: 'run',
      root,
      config_path: CONFIG_PATH,
      staged,
      index: result,
      embedding: config.embedding,
      storage: config.storage,
      include: config.scope.include,
      exclude: config.scope.exclude,
      assets: staged?.assets || [],
    };
  } finally {
    await store?.close();
  }
}

function helpText() {
  return [
    'Agent Sam · codebaseindex (ingest)',
    '',
    '  Guided SAM primitive for indexing a repo and/or dropped materials.',
    '  Pipeline: sam.codebaseindex.index.run',
    '  Operation: codebaseindex.ingest',
    '',
    '  Embedding models are discovered from your configured provider credentials',
    '  and live `ollama list` (local models are optional, never required).',
    '  Include/exclude paths are prompted — AgentSam does not invent a denylist.',
    '',
    '  agentsam codebaseindex              interactive wizard (clack)',
    '  agentsam ingest                     alias',
    '  agentsam codebaseindex --paths …    materials',
    '  agentsam codebaseindex --include src --exclude node_modules,.git',
    '  agentsam codebaseindex --plan       plan only',
    '  agentsam codebaseindex --embed      enable embedding pass after you pick a model',
    '',
    '  tip: use skill agentsam-codebaseindex',
    '',
  ].join('\n');
}

function parseArgv(argv = []) {
  const out = {
    help: false,
    json: false,
    plan: false,
    embed: false,
    yes: false,
    interactive: null,
    paths: [],
    include: '',
    exclude: '',
    storage: '',
    embedding: '',
    cwd: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--plan') out.plan = true;
    else if (arg === '--embed') out.embed = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--interactive' || arg === '-i') out.interactive = true;
    else if (arg === '--no-interactive') out.interactive = false;
    else if (arg === '--cwd') out.cwd = argv[++i] || '';
    else if (arg === '--paths' || arg === '--materials') out.paths.push(...splitList(argv[++i] || ''));
    else if (arg === '--include') out.include = argv[++i] || '';
    else if (arg === '--exclude') out.exclude = argv[++i] || '';
    else if (arg === '--storage') out.storage = argv[++i] || '';
    else if (arg === '--embedding') out.embedding = argv[++i] || '';
    else if (!arg.startsWith('-')) out.paths.push(arg);
    else throw new Error(`Unknown codebaseindex option: ${arg}`);
  }
  return out;
}

async function runWizard(root, opts) {
  intro('AgentSam · codebaseindex ingest');
  note(
    [
      'Paste or drag-drop files into the next prompt:',
      'archives (.zip .tar .tgz), site/build trees, HTML, images, GLB, or code.',
      'Leave blank to index using the include/exclude you set next.',
    ].join('\n'),
    'Materials',
  );

  const paste = pick(await text({
    message: 'Paths to ingest (paste/drop; blank = scope paths only)',
    placeholder: '/path/to/build.tar.gz  ./dist  screenshot.png',
  }), 'Ingest cancelled');

  const pasted = parsePastedPaths(paste);
  const materials = [...new Set([...(opts.paths || []), ...pasted])];

  const topLevel = listTopLevel(root);
  note(
    topLevel.length
      ? `Top-level in ${root}:\n${topLevel.slice(0, 40).map((n) => `  ${n}`).join('\n')}${topLevel.length > 40 ? '\n  …' : ''}`
      : `Repository: ${root}`,
    'Workspace',
  );

  const discovered = await discoverIngestModelOptions();
  let include = opts.include ? splitList(opts.include) : [];
  let exclude = opts.exclude ? splitList(opts.exclude) : [];

  if (discovered.assistModels.length) {
    const assistChoice = pick(await select({
      message: 'Allowlist / denylist',
      initialValue: 'manual',
      options: [
        { value: 'manual', label: 'Enter include/exclude myself', hint: 'recommended default' },
        { value: 'assist', label: 'Suggest with local Ollama (optional)', hint: 'uses a chat model from ollama list' },
      ],
    }));

    if (assistChoice === 'assist') {
      const modelPick = pick(await select({
        message: 'Local model for scope suggestions',
        options: discovered.assistModels.map((row) => ({
          value: row.model,
          label: row.label,
          hint: row.hint,
        })),
      }));
      try {
        const suggestion = await suggestScopeWithLocalModel({
          root,
          model: modelPick,
          topLevel,
        });
        note(
          [
            suggestion.rationale || 'Local model suggestion',
            `include: ${(suggestion.include || []).join(', ') || '(none)'}`,
            `exclude: ${(suggestion.exclude || []).join(', ') || '(none)'}`,
          ].join('\n'),
          `Suggested by ${modelPick}`,
        );
        const accept = pick(await confirm({
          message: 'Use these suggestions as the starting include/exclude?',
          initialValue: true,
        }));
        if (accept) {
          include = suggestion.include;
          exclude = suggestion.exclude;
        }
      } catch (error) {
        note(error?.message || String(error), 'Local assist unavailable — enter paths manually');
      }
    }
  }

  const includeRaw = pick(await text({
    message: 'Include paths (comma-separated relative; blank = . when no materials)',
    initialValue: include.join(',') || (materials.length ? '' : opts.include || ''),
    placeholder: 'src,packages,docs',
  }));
  include = splitList(includeRaw);
  if (!include.length && !materials.length) include = ['.'];

  const excludeRaw = pick(await text({
    message: 'Exclude paths (comma-separated relative; blank = exclude nothing)',
    initialValue: exclude.join(',') || opts.exclude || '',
    placeholder: 'node_modules,.git,dist  (only if you want them excluded)',
  }));
  exclude = splitList(excludeRaw);

  const storage = pick(await select({
    message: 'Storage preference',
    initialValue: opts.storage || 'sqlite',
    options: [
      { value: 'sqlite', label: 'SQLite (local)', hint: '.agentsam/knowledge/index.sqlite' },
      { value: 'postgres', label: 'Postgres / pgvector', hint: 'requires AGENTSAM_DATABASE_URL' },
    ],
  }));

  if (discovered.options.length <= 1) {
    note(
      [
        'No embedding providers discovered from credentials or Ollama.',
        'Configure keys via `agentsam providers` or start Ollama (`ollama list`).',
        'Continuing with AST/text-only is always valid.',
      ].join('\n'),
      'Embeddings',
    );
  } else {
    const sources = [
      discovered.ollama?.online ? `ollama online (${(discovered.ollama.models || []).length} tags)` : 'ollama offline',
      ...(discovered.inventory?.providers || [])
        .filter((p) => p.configured)
        .map((p) => `${p.id} credential`),
    ].join(' · ');
    note(`Discovered from your machine: ${sources || 'none'}`, 'Model discovery');
  }

  const embeddingChoice = pick(await select({
    message: 'Embedding model (discovered for this machine)',
    initialValue: opts.embedding && discovered.options.some((o) => o.value === opts.embedding)
      ? opts.embedding
      : 'none',
    options: discovered.options.map((row) => ({
      value: row.value,
      label: row.label,
      hint: row.hint,
    })),
  }));

  const runEmbed = embeddingChoice !== 'none' && pick(await confirm({
    message: embeddingChoice.startsWith('ollama|')
      ? 'Run local embedding pass with this Ollama model?'
      : 'Run embedding pass with this provider model? (may cost tokens)',
    initialValue: Boolean(opts.embed) || embeddingChoice.startsWith('ollama|'),
  }));

  const planOnly = pick(await select({
    message: 'Execution',
    initialValue: opts.plan ? 'plan' : 'run',
    options: [
      { value: 'plan', label: 'Plan only', hint: 'config + plan receipt' },
      { value: 'run', label: 'Run ingest now', hint: 'writes knowledge store' },
    ],
  })) === 'plan';

  const summary = [
    `root: ${root}`,
    `materials: ${materials.length || 'none'}`,
    `include: ${include.length ? include.join(', ') : '(from materials)'}`,
    `exclude: ${exclude.join(', ') || '(none — user left blank)'}`,
    `storage: ${storage}`,
    `embedding: ${embeddingChoice}`,
    `embed pass: ${runEmbed ? 'yes' : 'no'}`,
    `mode: ${planOnly ? 'plan' : 'run'}`,
  ].join('\n');
  note(summary, 'Confirm');
  const ok = pick(await confirm({ message: 'Proceed with codebaseindex.ingest?', initialValue: true }));
  if (!ok) {
    cancel('Ingest aborted');
    return null;
  }

  const result = await runCodebaseindexIngest({
    root,
    materials,
    include: include.length ? include : undefined,
    exclude,
    storage,
    embeddingChoice,
    embed: runEmbed,
    planOnly,
  });

  outro(planOnly
    ? `Plan ready · pipeline ${result.pipeline}`
    : `Ingest complete · pipeline ${result.pipeline}`);
  return result;
}

/**
 * CLI entry: agentsam codebaseindex | ingest
 */
export async function runCodebaseindex(argv = []) {
  const opts = parseArgv(argv);
  if (opts.help) {
    process.stdout.write(helpText());
    return { ok: true, help: true };
  }

  const root = repositoryRoot(opts.cwd || process.cwd());
  ensureProjectManifest(root, {});
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const wantInteractive = opts.interactive === true || (opts.interactive !== false && tty && !opts.yes && !opts.paths.length && !opts.include);

  let result;
  if (wantInteractive) {
    result = await runWizard(root, opts);
  } else {
    result = await runCodebaseindexIngest({
      root,
      materials: opts.paths,
      include: opts.include ? splitList(opts.include) : undefined,
      exclude: opts.exclude ? splitList(opts.exclude) : [],
      storage: opts.storage || 'sqlite',
      embeddingChoice: opts.embedding || 'none',
      embed: opts.embed,
      planOnly: opts.plan,
    });
  }

  if (!result) return null;
  if (opts.json || !tty) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (!wantInteractive) {
    process.stdout.write(`${pc.green('✓')} codebaseindex.ingest ${result.mode}\n`);
    process.stdout.write(`  pipeline  ${result.pipeline}\n`);
    process.stdout.write(`  include   ${(result.include || []).join(', ')}\n`);
    process.stdout.write(`  storage   ${result.storage?.driver}\n`);
    process.stdout.write(`  embedding ${result.embedding?.provider}/${result.embedding?.model}\n`);
    if (result.staged?.assets?.length) {
      process.stdout.write(`  assets    ${result.staged.assets.length} staged\n`);
    }
    process.stdout.write(`  tip: use skill agentsam-codebaseindex\n`);
  }
  return result;
}
