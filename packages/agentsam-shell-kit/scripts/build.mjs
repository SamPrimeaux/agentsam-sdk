import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
execFileSync(
  process.execPath,
  ['scripts/ensure-local-deps.mjs'],
  { cwd, stdio: 'inherit' },
);
rmSync(`${cwd}/dist`, { recursive: true, force: true });
await build({
  absWorkingDir: cwd,
  entryPoints: { index: 'src/index.ts', 'shell/index': 'src/shell/index.ts', 'empty-state/index': 'src/empty-state/index.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@inneranimalmedia/agentsam-workbench', '@inneranimalmedia/agentsam-workbench/*', '*.css'],
});
mkdirSync(`${cwd}/dist/empty-state`, { recursive: true });
copyFileSync(`${cwd}/src/empty-state/EmptyState.css`, `${cwd}/dist/empty-state/EmptyState.css`);
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
