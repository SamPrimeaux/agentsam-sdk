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
import { buildInventory, formatInventoryTree } from '../lib/ingest/inventory.js';
import { createCodebaseindexJobGraph, advanceJobGraph } from '../lib/ingest/job-graph.js';

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
  let jobGraph = createCodebaseindexJobGraph({
    status: 'planned',
    current: 'material.stage',
  });

  if (materials.length) {
    staged = stageMaterials({ root, materials });
    include = [...new Set([...include.filter((x) => x !== '.'), ...staged.include])];
    if (!include.length) include = staged.include.length ? staged.include : ['.'];
    jobGraph = advanceJobGraph(jobGraph, 'material.stage');
  }

  const inventory = input.inventory || buildInventory({ root, materials: staged });
  jobGraph = advanceJobGraph({ ...jobGraph, current: 'inventory.classify' }, 'inventory.classify');

  const embedding = input.embedding && typeof input.embedding === 'object'
    ? input.embedding
    : parseEmbeddingChoice(input.embeddingChoice || 'none');

  const storage = input.storage === 'postgres' ? 'postgres' : 'sqlite';
  const vectors = input.vectors || (embedding.provider === 'none' ? 'none'
    : storage === 'postgres' ? 'pgvector' : 'sqlite_exact');

  const config = loadOrBuildConfig(root, {
    include,
    exclude,
    embedding,
    storage,
    scopeName: input.scope || 'ingest',
    connectionEnv: input.connectionEnv,
  });
  jobGraph = advanceJobGraph(jobGraph, 'scope.resolve');
  jobGraph = advanceJobGraph(jobGraph, 'profile.resolve');
  jobGraph = advanceJobGraph(jobGraph, 'lane.resolve');

  const embed = Boolean(input.embed) && embedding.provider !== 'none';
  const store = await openStore(root, config, false);
  try {
    if (input.planOnly) {
      const plan = await planIndex({ root, config, store, embed });
      jobGraph = advanceJobGraph(jobGraph, 'plan.dry_run');
      jobGraph.status = 'planned';
      return {
        pipeline: 'sam.codebaseindex.index.run',
        operation: 'codebaseindex.ingest',
        mode: 'plan',
        root,
        config_path: CONFIG_PATH,
        staged,
        inventory,
        storage_lanes: { metadata: storage, vectors },
        job_graph: jobGraph,
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
    jobGraph = advanceJobGraph(jobGraph, 'plan.dry_run');
    jobGraph = advanceJobGraph(jobGraph, 'ast.parse');
    jobGraph = advanceJobGraph(jobGraph, 'chunks.build');
    if (embed) jobGraph = advanceJobGraph(jobGraph, 'embedding.generate');
    jobGraph = advanceJobGraph(jobGraph, 'storage.write');
    jobGraph = advanceJobGraph(jobGraph, 'generation.verify');
    return {
      pipeline: 'sam.codebaseindex.index.run',
      operation: 'codebaseindex.ingest',
      mode: 'run',
      root,
      config_path: CONFIG_PATH,
      staged,
      inventory,
      storage_lanes: { metadata: storage, vectors },
      job_graph: jobGraph,
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
    '  (OpenAI, Gemini, Cloudflare Workers AI for Vectorize). Ollama is optional.',
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
  intro('AgentSam · codebaseindex (inventory-first)');

  // ① Providers (informational — discovery only)
  const discovered = await discoverIngestModelOptions();
  const providerLines = [
    discovered.ollama?.online
      ? `ollama online · ${(discovered.ollama.models || []).map((m) => m.name).join(', ')}`
      : 'ollama offline (optional local embed/assist)',
    ...(discovered.inventory?.providers || [])
      .filter((p) => p.configured)
      .map((p) => `${p.id} credential configured`),
  ];
  note(providerLines.join('\n') || 'No remote credentials — AST/text-only remains valid.', '① Connection');

  // ② Materials
  note(
    [
      'Paste or drag-drop archives, site builds, HTML, images, GLB, or folders.',
      'Leave blank to inventory the repository only.',
    ].join('\n'),
    '② Materials',
  );
  const paste = pick(await text({
    message: 'Paths to ingest (paste/drop; blank = repo inventory)',
    placeholder: '/path/to/build.tar.gz  ./dist  screenshot.png',
  }), 'Ingest cancelled');
  const materials = [...new Set([...(opts.paths || []), ...parsePastedPaths(paste)])];

  let staged = null;
  if (materials.length) {
    staged = stageMaterials({ root, materials });
  }

  // ③ Inventory / file map BEFORE scope
  const inventory = buildInventory({ root, materials: staged });
  note(formatInventoryTree(inventory), '③ Inventory / file map');
  const continueAfterInventory = pick(await confirm({
    message: 'Continue to include/exclude using this inventory?',
    initialValue: true,
  }));
  if (!continueAfterInventory) {
    cancel('Stopped after inventory');
    return { mode: 'inventory_only', inventory, staged, pipeline: 'sam.codebaseindex.index.run' };
  }

  // ④ Scope
  let include = opts.include ? splitList(opts.include) : [...(inventory.suggested.include || [])];
  let exclude = opts.exclude ? splitList(opts.exclude) : [];

  if (discovered.assistModels.length) {
    const assistChoice = pick(await select({
      message: '④ Scope — how to set include/exclude?',
      initialValue: 'from_inventory',
      options: [
        { value: 'from_inventory', label: 'Start from inventory suggestions', hint: 'you still edit' },
        { value: 'manual', label: 'Enter include/exclude myself', hint: 'blank exclude = exclude nothing' },
        { value: 'assist', label: 'Suggest with local Ollama (optional)', hint: 'advisory only' },
      ],
    }));
    if (assistChoice === 'manual') {
      include = [];
      exclude = [];
    } else if (assistChoice === 'assist') {
      const modelPick = pick(await select({
        message: 'Local chat model for scope suggestions',
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
          topLevel: inventory.top_level,
        });
        note(
          [
            suggestion.rationale || 'Local model suggestion (advisory)',
            `include: ${(suggestion.include || []).join(', ') || '(none)'}`,
            `exclude: ${(suggestion.exclude || []).join(', ') || '(none)'}`,
          ].join('\n'),
          `Suggested by ${modelPick}`,
        );
        if (pick(await confirm({ message: 'Use as starting include/exclude?', initialValue: true }))) {
          include = suggestion.include;
          exclude = suggestion.exclude;
        }
      } catch (error) {
        note(error?.message || String(error), 'Local assist unavailable');
      }
    }
  }

  include = splitList(pick(await text({
    message: 'Include paths (comma-separated)',
    initialValue: include.join(',') || (materials.length ? '' : '.'),
    placeholder: 'src,packages,apps,docs',
  })));
  if (!include.length && !materials.length) include = ['.'];

  exclude = splitList(pick(await text({
    message: 'Exclude paths (blank = exclude nothing)',
    initialValue: exclude.join(','),
    placeholder: 'node_modules,.git,dist — only if you want them out',
  })));

  // ⑤ Embedding profile (discovered)
  note(
    discovered.options.length > 1
      ? `Discovered embed options from credentials (OpenAI/Gemini/Workers AI) + optional Ollama (${discovered.options.length - 1}).`
      : 'No embed providers discovered — AST/text-only is available. Configure CF/OpenAI/Gemini to unlock Vectorize-ready models.',
    '⑤ Embedding profile',
  );
  const embeddingChoice = pick(await select({
    message: 'Embedding model',
    initialValue: 'none',
    options: discovered.options.map((row) => ({
      value: row.value,
      label: row.label,
      hint: row.hint,
    })),
  }));
  const runEmbed = embeddingChoice !== 'none' && pick(await confirm({
    message: embeddingChoice.startsWith('ollama|')
      ? 'Run local embedding pass?'
      : 'Run embedding pass (may cost provider tokens)?',
    initialValue: embeddingChoice.startsWith('ollama|'),
  }));

  // ⑥ Storage lanes
  const lane = pick(await select({
    message: '⑥ Vector / data source lane',
    initialValue: 'local',
    options: [
      { value: 'local', label: 'Local SQLite', hint: 'metadata + optional exact vectors · $0 cloud' },
      { value: 'supabase', label: 'Supabase + node-api / Hyperdrive', hint: 'pgvector ANN · BYO edge template' },
      { value: 'vectorize', label: 'Cloudflare Vectorize', hint: 'customer CF lane · not IAM host SSOT' },
    ],
  }));
  const storage = lane === 'supabase' ? 'postgres' : 'sqlite';
  if (lane === 'vectorize') {
    note('Vectorize lane recorded for plan/receipt; full CF adapter wiring is a follow-up slice.', 'Lane note');
  }
  if (lane === 'supabase') {
    note('Uses AGENTSAM_DATABASE_URL / Hyperdrive-style postgres. Owner IAM already has node-api.', 'Lane note');
  }

  // ⑦ Dry-run vs execute
  const planOnly = pick(await select({
    message: '⑦ Execution',
    initialValue: opts.plan ? 'plan' : 'plan',
    options: [
      { value: 'plan', label: 'Dry-run / plan (writes config + plan receipt, no generation activate)', hint: 'recommended first' },
      { value: 'run', label: 'Execute ingest now', hint: 'writes knowledge store' },
    ],
  })) === 'plan';

  const summary = [
    `root: ${root}`,
    `materials: ${materials.length || 'none'}`,
    `inventory files: ${inventory.counts.files}`,
    `include: ${include.join(', ') || '(from materials)'}`,
    `exclude: ${exclude.join(', ') || '(none)'}`,
    `embedding: ${embeddingChoice}`,
    `lane: ${lane} (metadata=${storage})`,
    `mode: ${planOnly ? 'plan' : 'run'}`,
  ].join('\n');
  note(summary, 'Confirm');
  if (!pick(await confirm({ message: 'Proceed with codebaseindex.ingest?', initialValue: true }))) {
    cancel('Ingest aborted');
    return null;
  }

  const result = await runCodebaseindexIngest({
    root,
    materials,
    include: include.length ? include : undefined,
    exclude,
    storage,
    vectors: lane === 'vectorize' ? 'vectorize' : lane === 'supabase' ? 'pgvector' : (runEmbed ? 'sqlite_exact' : 'none'),
    embeddingChoice,
    embed: runEmbed,
    planOnly,
    inventory,
  });

  if (result?.job_graph) {
    note(
      result.job_graph.nodes.map((n) => `${n.status === 'done' ? '✓' : n.status === 'run' ? '→' : '·'} ${n.id}`).join('\n'),
      'Job graph',
    );
  }

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
