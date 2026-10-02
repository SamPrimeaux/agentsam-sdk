import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('published compatibility package bundles its empty-state export with CSS for a browser consumer', async () => {
  const result = await build({
    stdin: {
      contents: "import { EmptyState, InstallableEmptyState } from './dist/empty-state/index.js'; console.log(EmptyState, InstallableEmptyState);",
      resolveDir: root,
      sourcefile: 'consumer-entry.js',
      loader: 'js',
    },
    bundle: true,
    write: false,
    outdir: 'out',
    platform: 'browser',
    format: 'esm',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  });
  assert.ok(result.outputFiles.some((file) => file.path.endsWith('.js')));
  assert.ok(result.outputFiles.some((file) => file.path.endsWith('.css')));
  assert.equal(fs.existsSync(path.join(root, 'dist/empty-state/EmptyState.css')), true);
});
