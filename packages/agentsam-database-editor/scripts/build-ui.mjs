import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${cwd}/dist`, { recursive: true, force: true });
await build({
  absWorkingDir: cwd,
  entryPoints: {
    'ui/index': 'src/ui/index.ts',
    'ui/client': 'src/ui/client.ts',
    'frontend/index': 'frontend/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.css': 'copy' },
  assetNames: '[dir]/[name]',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'lucide-react', 'recharts'],
});
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
