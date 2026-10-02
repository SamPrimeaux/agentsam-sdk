import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${cwd}/dist`, { recursive: true, force: true });
await build({
  absWorkingDir: cwd,
  entryPoints: { index: 'src/index.ts', 'contracts/index': 'src/contracts/index.ts', 'frontend/index': 'src/frontend/index.ts', 'client/index': 'src/client/index.ts', 'fixtures/index': 'src/fixtures/index.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'lucide-react', '*.css'],
});
mkdirSync(`${cwd}/dist/frontend`, { recursive: true });
copyFileSync(`${cwd}/src/frontend/theme.css`, `${cwd}/dist/frontend/theme.css`);
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
