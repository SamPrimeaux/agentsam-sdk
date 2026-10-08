import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, ['scripts/ensure-local-deps.mjs'], { cwd, stdio: 'inherit' });
rmSync(`${cwd}/dist`, { recursive: true, force: true });
await build({
  absWorkingDir: cwd,
  entryPoints: {
    index: 'src/index.ts',
    'agent/index': 'src/agent/index.ts',
    'agent/capability-catalog': 'src/agent/capability-catalog.ts',
    'shell/index': 'src/shell/index.ts',
    'browser/index': 'src/browser/index.ts',
    'terminal/index': 'src/terminal/index.ts',
    'projects/index': 'src/projects/index.ts',
    'timeline/index': 'src/timeline/index.ts',
    'manufacturing/index': 'src/manufacturing/index.ts',
    'widgets/index': 'src/widgets/index.ts',
    'knowledge/index': 'src/knowledge/index.ts',
  },
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.css': 'copy' },
  assetNames: '[dir]/[name]',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'lucide-react', '@inneranimalmedia/agentsam-contracts', '@inneranimalmedia/agentsam-loading-scene', '@inneranimalmedia/agentsam-loading-scene/*'],
});
mkdirSync(`${cwd}/dist/agent`, { recursive: true });
for (const file of ['mini-agentsam.css', 'contextual-composer.css', 'tool-permission.css']) {
  copyFileSync(`${cwd}/src/agent/${file}`, `${cwd}/dist/agent/${file}`);
}
copyFileSync(`${cwd}/src/project-control.css`, `${cwd}/dist/project-control.css`);
mkdirSync(`${cwd}/dist/knowledge`, { recursive: true });
copyFileSync(`${cwd}/src/knowledge/autorag-workflow.css`, `${cwd}/dist/knowledge/autorag-workflow.css`);
mkdirSync(`${cwd}/dist/widgets`, { recursive: true });
copyFileSync(`${cwd}/src/widgets/widgets.css`, `${cwd}/dist/widgets/widgets.css`);
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
