import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';

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
  logLevel: 'info',
});
