import { defineConfig } from 'tsup';
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dtsTmp = join(root, '.dts-tmp');

function copyStyles() {
  const destDir = join(root, 'dist/styles');
  mkdirSync(destDir, { recursive: true });
  const stylesDir = join(root, 'frontend/src/styles');
  if (existsSync(stylesDir)) {
    cpSync(stylesDir, destDir, { recursive: true });
  }
  const studio = join(destDir, 'studio.css');
  if (existsSync(studio)) {
    copyFileSync(studio, join(root, 'dist/studio.css'));
  }
}

const sharedEsbuild = {
  alias: {
    '@inneranimalmedia/agentsam-cms-shared': join(root, 'shared/cms/src/index.ts'),
    '@inneranimalmedia/agentsam-cms-backend/api': join(root, 'backend/src/api/client.ts'),
    '@inneranimalmedia/agentsam-cms-backend/model': join(root, 'backend/src/model.ts'),
    '@inneranimalmedia/agentsam-cms-backend/preview': join(root, 'backend/src/preview/bridge.ts'),
    '@inneranimalmedia/agentsam-cms-backend/routing': join(root, 'backend/src/routing/index.js'),
    '@inneranimalmedia/agentsam-cms-backend': join(root, 'backend/src/index.ts'),
  },
  loader: {
    '.css': 'empty',
  },
};

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function relImport(fromFile, toFileSansExt) {
  let rel = relative(dirname(fromFile), toFileSansExt).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

/** Rewrite shared/cms/src and cross-tree imports so public dist .d.ts resolve. */
function rewriteDtsImports(content, fromFile) {
  return content.replace(
    /((?:from|import)\s*\(?\s*)['"]([^'"]+)['"]/g,
    (full, prefix, spec) => {
      if (!spec || (!spec.includes('shared/cms/src/') && !spec.includes('starter-packs/'))) {
        return full;
      }

      let targetAbs;
      if (spec.includes('shared/cms/src/')) {
        const rest = spec.split('shared/cms/src/')[1].replace(/\.js$/, '');
        targetAbs = join(root, 'dist/shared', rest);
      } else if (spec.includes('starter-packs/')) {
        const rest = spec.split('starter-packs/')[1].replace(/\.js$/, '');
        targetAbs = join(root, 'dist/starter-packs', rest);
      } else {
        return full;
      }

      const rewritten = relImport(fromFile, targetAbs);
      return `${prefix}'${rewritten}'`;
    },
  );
}

function writeDts(destAbs, content) {
  ensureDir(destAbs);
  writeFileSync(destAbs, rewriteDtsImports(content, destAbs));
}

function copyDtsTree(fromDir, toDir) {
  for (const file of walkFiles(fromDir)) {
    if (!file.endsWith('.d.ts')) continue;
    const rel = relative(fromDir, file);
    const dest = join(toDir, rel);
    writeDts(dest, readFileSync(file, 'utf8'));
  }
}

function removeIfExists(abs) {
  if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
}

async function emitDeclarations() {
  copyStyles();
  const { spawnSync } = await import('node:child_process');

  removeIfExists(dtsTmp);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '-p', 'tsconfig.build.json', '--outDir', '.dts-tmp'],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error('declaration emit failed');
  }

  // --- public shared surface (flat) ---
  const sharedDest = join(root, 'dist/shared');
  mkdirSync(sharedDest, { recursive: true });
  copyDtsTree(join(dtsTmp, 'shared/cms/src'), sharedDest);

  // Keep shared/index.js from tsup; ensure shared/index.d.ts is the flat barrel.
  // (copyDtsTree already wrote index.d.ts from shared/cms/src/index.d.ts)

  // --- thin public adapter alias ---
  writeFileSync(join(root, 'dist/adapter.d.ts'), "export * from './shared/adapter';\n");

  // --- public sqlite-adapter alias (Node-only; types only) ---
  const sqliteSrc = join(dtsTmp, 'adapters/sqlite.d.ts');
  if (!existsSync(sqliteSrc)) {
    throw new Error('missing sqlite declaration emit');
  }
  writeDts(join(root, 'dist/sqlite-adapter.d.ts'), readFileSync(sqliteSrc, 'utf8'));

  // --- backend public entries ---
  const backendMap = [
    ['backend/src/api/client.d.ts', 'backend/api.d.ts'],
    ['backend/src/model.d.ts', 'backend/model.d.ts'],
    ['backend/src/preview/bridge.d.ts', 'backend/preview.d.ts'],
    ['backend/src/preview/urls.d.ts', 'backend/preview-urls.d.ts'],
    ['backend/src/storefront.d.ts', 'backend/storefront.d.ts'],
  ];
  for (const [from, to] of backendMap) {
    const src = join(dtsTmp, from);
    if (!existsSync(src)) continue;
    writeDts(join(root, 'dist', to), readFileSync(src, 'utf8'));
  }
  writeFileSync(
    join(root, 'dist/backend/index.d.ts'),
    [
      "export * from './api';",
      "export * from '../shared/index';",
      "export * from './model';",
      "export * from './preview';",
      "export * from './preview-urls';",
      "export * from './storefront';",
      '',
    ].join('\n'),
  );

  // --- root index types: frontend modules + starter pack (no tsc dump paths) ---
  copyDtsTree(join(dtsTmp, 'frontend/src'), join(root, 'dist'));
  copyDtsTree(join(dtsTmp, 'starter-packs'), join(root, 'dist/starter-packs'));
  copyDtsTree(join(dtsTmp, 'import'), join(root, 'dist/import'));
  copyDtsTree(join(dtsTmp, 'local'), join(root, 'dist/local'));

  const indexSrc = join(dtsTmp, 'frontend/src/index.d.ts');
  if (!existsSync(indexSrc)) {
    throw new Error('missing frontend index declaration emit');
  }
  writeDts(join(root, 'dist/index.d.ts'), readFileSync(indexSrc, 'utf8'));

  // Strip compiler-dump / duplicate paths that must not ship
  for (const leak of [
    join(root, 'dist/frontend'),
    join(root, 'dist/shared/cms'),
    join(root, 'dist/backend/src'),
    join(root, 'dist/adapters/sqlite.d.ts'),
    join(root, 'dist/adapters/node-sqlite.d.ts'),
    join(root, 'dist/fixtures'),
    dtsTmp,
  ]) {
    removeIfExists(leak);
  }

  // Guard: public alias must exist; internal sqlite dump must not
  if (!existsSync(join(root, 'dist/sqlite-adapter.d.ts'))) {
    throw new Error('sqlite-adapter.d.ts missing after assemble');
  }
  if (existsSync(join(root, 'dist/adapters/sqlite.d.ts'))) {
    throw new Error('internal dist/adapters/sqlite.d.ts must not ship');
  }
}

export default defineConfig([
  {
    entry: {
      index: 'frontend/src/index.ts',
      adapter: 'shared/cms/src/adapter.ts',
      'shared/index': 'shared/cms/src/index.ts',
      'backend/index': 'backend/src/index.ts',
      'backend/api': 'backend/src/api/client.ts',
      'backend/model': 'backend/src/model.ts',
      'backend/preview': 'backend/src/preview/bridge.ts',
      'backend/routing': 'backend/src/routing/index.js',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    target: 'es2022',
    outDir: 'dist',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    esbuildOptions(options) {
      options.alias = sharedEsbuild.alias;
      options.loader = { ...(options.loader || {}), ...sharedEsbuild.loader };
    },
    async onSuccess() {
      await emitDeclarations();
    },
  },
  {
    entry: {
      'sqlite-adapter': 'adapters/sqlite.ts',
      'import/index': 'import/index.ts',
      'local/index': 'local/index.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    treeshake: true,
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    external: ['node:sqlite', 'node:http', 'node:fs', 'node:path', 'node:os', 'node:crypto', 'node:child_process', 'node:url', 'node:module'],
    esbuildOptions(options) {
      options.alias = sharedEsbuild.alias;
    },
    onSuccess() {
      const sqliteBundle = join(root, 'dist/sqlite-adapter.js');
      if (!existsSync(sqliteBundle)) return;
      const source = readFileSync(sqliteBundle, 'utf8');
      writeFileSync(
        sqliteBundle,
        source.replace(/from ['"]sqlite['"]/, "from 'node:sqlite'"),
      );
    },
  },
]);
