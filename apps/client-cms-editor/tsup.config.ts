import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, existsSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

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

async function emitDeclarations() {
  copyStyles();
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '-p', 'tsconfig.build.json'],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error('declaration emit failed');
  }
  const { existsSync: exists, mkdirSync: mkdir, copyFileSync: copy } = await import('node:fs');
  const map = [
    ['frontend/src/index.d.ts', 'index.d.ts'],
    ['shared/cms/src/adapter.d.ts', 'adapter.d.ts'],
    ['adapters/sqlite.d.ts', 'sqlite-adapter.d.ts'],
    ['shared/cms/src/index.d.ts', 'shared/index.d.ts'],
    ['backend/src/index.d.ts', 'backend/index.d.ts'],
    ['backend/src/api/client.d.ts', 'backend/api.d.ts'],
    ['backend/src/model.d.ts', 'backend/model.d.ts'],
    ['backend/src/preview/bridge.d.ts', 'backend/preview.d.ts'],
  ];
  for (const [from, to] of map) {
    const src = join(root, 'dist', from);
    const dest = join(root, 'dist', to);
    if (!exists(src)) continue;
    mkdir(dirname(dest), { recursive: true });
    copy(src, dest);
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
    external: ['node:sqlite'],
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
