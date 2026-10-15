import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Force one React copy: workspace packages can resolve their own react via symlinks,
// and two copies in one bundle crash hooks at render time (blank page).
const require = createRequire(import.meta.url);
const reactDir = path.dirname(require.resolve('react/package.json'));
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'));

await mkdir(new URL('./dist/assets/', import.meta.url), { recursive: true });
await cp(new URL('./index.html', import.meta.url), new URL('./dist/index.html', import.meta.url));

await build({
  entryPoints: [new URL('./src/main.tsx', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  outfile: new URL('./dist/assets/app.js', import.meta.url).pathname,
  loader: { '.ts': 'ts', '.tsx': 'tsx', '.css': 'css' },
  jsx: 'automatic',
  alias: { react: reactDir, 'react-dom': reactDomDir },
  logLevel: 'info',
});
