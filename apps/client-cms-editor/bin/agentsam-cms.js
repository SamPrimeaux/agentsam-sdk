#!/usr/bin/env node
/**
 * AgentSam CMS CLI — scaffold / import theme / local multipage runtime.
 * Bin entry must remain a plain relative .js path so npm publish keeps it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdkRoot = path.resolve(packageRoot, '../..');
const manifestPath = path.join(packageRoot, 'agentsam.app.json');
const PERSISTENCE = new Set(['sqlite', 'd1']);
const STARTERS = new Set(['heuristic', 'blank', 'import']);

function usage() {
  console.log(`
AgentSam website + CMS kit

  agentsam-cms --help
  agentsam-cms info
  agentsam-cms doctor
  agentsam-cms create <directory> --starter heuristic|blank|import [--theme <path>] [--persistence sqlite|d1]
  agentsam-cms import-theme <sourceDirOrZip> --out <theme-pack-dir>
  agentsam-cms dev [--db <sqlitePath>] [--site <siteId>] [--port 4317]
  agentsam-cms scaffold <directory> [--persistence sqlite|d1]   (legacy alias of create --starter heuristic)
  agentsam-cms preview

Local-first:
  create → SQLite + starter/theme → agentsam-cms dev
  → http://localhost:4317/        public multipage site
  → http://localhost:4317/cms     protected CMS surface
`.trim());
}

function info() {
  console.log(JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), null, 2));
}

function doctor() {
  const required = ['frontend', 'backend', 'shared', 'bin', 'package.json', 'agentsam.app.json', 'dist'];
  const missing = required.filter((rel) => !fs.existsSync(path.join(packageRoot, rel)));
  if (missing.length) {
    console.error('doctor failed; missing:', missing.join(', '));
    process.exit(1);
  }
  for (const rel of ['dist/index.js', 'dist/sqlite-adapter.js', 'dist/import/index.js', 'dist/local/index.js']) {
    if (!fs.existsSync(path.join(packageRoot, rel))) {
      console.error(`doctor failed; run npm run build (missing ${rel})`);
      process.exit(1);
    }
  }
  console.log('✓ client-cms-editor layout ok');
}

async function loadDist(rel) {
  return import(pathToFileURL(path.join(packageRoot, rel)).href);
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function importThemeCmd(args) {
  const parsed = parseArgs(args);
  const source = parsed._[0];
  const outDir = parsed.out;
  if (!source || !outDir) throw new Error('usage: agentsam-cms import-theme <source> --out <dir>');
  const { importThemeFromSource } = await loadDist('dist/import/index.js');
  const pack = importThemeFromSource(path.resolve(source), {
    outDir: path.resolve(outDir),
    packId: typeof parsed['pack-id'] === 'string' ? parsed['pack-id'] : undefined,
  });
  console.log(`✓ imported theme → ${path.resolve(outDir)}`);
  console.log(`  pages: ${pack.manifest.pages.join(', ')}`);
  console.log(`  assets: ${pack.manifest.assetCount} · donor candidates: ${pack.donorCandidates.length}`);
}

async function createCmd(args) {
  const parsed = parseArgs(args);
  const target = parsed._[0];
  if (!target) throw new Error('create requires a target directory');
  const starter = String(parsed.starter || 'heuristic');
  if (!STARTERS.has(starter)) throw new Error(`unsupported starter "${starter}"; choose heuristic|blank|import`);
  const persistence = String(parsed.persistence || 'sqlite');
  if (!PERSISTENCE.has(persistence)) {
    throw new Error(`unsupported persistence "${persistence}"; choose sqlite or d1`);
  }
  if (starter === 'import' && !parsed.theme) {
    throw new Error('create --starter import requires --theme <directory-or-zip>');
  }

  const targetRoot = path.resolve(process.cwd(), target);
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length) {
    throw new Error(`target directory is not empty: ${targetRoot}`);
  }
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.mkdirSync(path.join(targetRoot, '.agentsam', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(targetRoot, 'public'), { recursive: true });

  const cfg = {
    schema: 'agentsam.cms.project.v1',
    starter,
    persistence,
    siteId: starter === 'import' ? 'imported' : starter,
    dbPath: '.agentsam/cms.sqlite',
    assetsDir: '.agentsam/assets',
    port: 4317,
    cmsBase: '/cms',
    auth: { mode: 'local-dev-principal' },
  };
  fs.writeFileSync(path.join(targetRoot, 'cms.config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(
    path.join(targetRoot, 'agentsam.app.json'),
    `${JSON.stringify(
      {
        schema: 'agentsam.app.v1',
        id: path.basename(targetRoot),
        product_id: 'cms',
        name: path.basename(targetRoot),
        kind: 'customer-site',
        package: '@inneranimalmedia/client-cms-editor',
      },
      null,
      2,
    )}\n`,
  );

  if (persistence !== 'sqlite') {
    console.log(`✓ created project shell at ${targetRoot} (persistence=${persistence})`);
    console.log('  connect a CmsEditorAdapter before dev; local SQLite path skipped');
    return;
  }

  const { SqliteCmsAdapter } = await loadDist('dist/sqlite-adapter.js');
  const rootMod = await loadDist('dist/index.js');
  const { installStarterPack } = rootMod;
  const dbPath = path.join(targetRoot, cfg.dbPath);
  const adapter = new SqliteCmsAdapter(dbPath);
  try {
    let pack;
    if (starter === 'heuristic') {
      pack = rootMod.heuristicStarterPack;
    } else if (starter === 'blank') {
      pack = rootMod.blankStarterPack;
    } else {
      const { importThemeFromSource } = await loadDist('dist/import/index.js');
      const themeOut = path.join(targetRoot, 'starter', 'imported-theme-pack');
      const themePack = importThemeFromSource(path.resolve(String(parsed.theme)), {
        outDir: themeOut,
        packId: 'imported',
      });
      pack = themePack.starterPack;
      cfg.themePack = 'starter/imported-theme-pack';
      fs.writeFileSync(path.join(targetRoot, 'cms.config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
    }

    const installed = await installStarterPack(adapter, pack, { siteId: cfg.siteId });
    for (const pageId of installed.pageIds) {
      await adapter.publish(pageId);
    }
    console.log(`✓ created ${starter} project at ${targetRoot}`);
    console.log(`  sqlite: ${cfg.dbPath}`);
    console.log(`  pages published: ${installed.pageIds.length}`);
    console.log(`  next: cd ${target} && npx agentsam-cms dev`);
  } finally {
    adapter.close();
  }
}

async function devCmd(args) {
  const parsed = parseArgs(args);
  const cwd = process.cwd();
  const cfgPath = path.join(cwd, 'cms.config.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
  const dbPath = path.resolve(cwd, String(parsed.db || cfg.dbPath || '.agentsam/cms.sqlite'));
  const siteId = String(parsed.site || cfg.siteId || 'heuristic');
  const port = Number(parsed.port || cfg.port || 4317);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`sqlite db missing at ${dbPath} — run agentsam-cms create first`);
  }

  const { SqliteCmsAdapter } = await loadDist('dist/sqlite-adapter.js');
  const { startLocalCmsRuntime } = await loadDist('dist/local/index.js');
  const adapter = new SqliteCmsAdapter(dbPath);
  const runtime = await startLocalCmsRuntime({
    adapter,
    siteId,
    port,
    cmsBase: cfg.cmsBase || '/cms',
  });
  console.log(`✓ local CMS runtime`);
  console.log(`  public  ${runtime.origin}/`);
  console.log(`  cms     ${runtime.origin}/cms`);
  console.log(`  sqlite  ${dbPath}`);
  console.log('  Ctrl+C to stop');

  const shutdown = async () => {
    await runtime.close();
    adapter.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function preview(args) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts?.preview ? 'preview' : pkg.scripts?.dev ? 'dev' : null;
  if (!script) {
    console.error('no preview/dev script in package.json');
    process.exit(1);
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', script, '--', ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

function scaffoldLegacy(args) {
  const parsed = parseArgs(args);
  return createCmd([parsed._[0], '--starter', 'heuristic', '--persistence', parsed.persistence || 'sqlite'].filter(Boolean));
}

const [cmd = 'help', ...rest] = process.argv.slice(2);
try {
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') usage();
  else if (cmd === 'info') info();
  else if (cmd === 'doctor') doctor();
  else if (cmd === 'create') await createCmd(rest);
  else if (cmd === 'import-theme') await importThemeCmd(rest);
  else if (cmd === 'dev') await devCmd(rest);
  else if (cmd === 'scaffold') await scaffoldLegacy(rest);
  else if (cmd === 'preview') preview(rest);
  else {
    console.error(`unknown command: ${cmd}`);
    usage();
    process.exit(1);
  }
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
}
