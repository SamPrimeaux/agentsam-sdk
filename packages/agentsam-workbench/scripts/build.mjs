import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
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
    'agent/SelectionToolbar': 'src/agent/SelectionToolbar.tsx',
    'agent/capability-catalog': 'src/agent/capability-catalog.ts',
    'shell/studio-panels': 'src/shell/studio-panels.ts',
    'shell/studio-icons': 'src/shell/studio-icons.ts',
    'shell/index': 'src/shell/index.ts',
    'browser/index': 'src/browser/index.ts',
    'terminal/index': 'src/terminal/index.ts',
    'projects/index': 'src/projects/index.ts',
    'resources/index': 'src/resources/index.ts',
    'timeline/index': 'src/timeline/index.ts',
    'manufacturing/index': 'src/manufacturing/index.ts',
    'widgets/index': 'src/widgets/index.ts',
    'widgets/creative-covers': 'src/widgets/creative-covers.ts',
    'knowledge/index': 'src/knowledge/index.ts',
    'design/index': 'src/design/index.ts',
    'workflows/index': 'src/workflows/index.ts',
    'workflows/model': 'src/workflows/model.ts',
  },
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.css': 'copy', '.svg': 'text' },
  plugins: [{
    name: 'svg-raw-source',
    setup(build) {
      build.onResolve({ filter: /\.svg\?raw$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
      }));
    },
  }],
  assetNames: '[dir]/[name]',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'lucide-react', '@inneranimalmedia/agentsam-contracts', '@inneranimalmedia/agentsam-loading-scene', '@inneranimalmedia/agentsam-loading-scene/*'],
});
mkdirSync(`${cwd}/dist/widgets/covers`, { recursive: true });
cpSync(`${cwd}/src/widgets/covers`, `${cwd}/dist/widgets/covers`, { recursive: true });
mkdirSync(`${cwd}/dist/agent`, { recursive: true });
for (const file of ['mini-agentsam.css', 'contextual-composer.css', 'tool-permission.css', 'selection-toolbar.css', 'thread.css']) {
  copyFileSync(`${cwd}/src/agent/${file}`, `${cwd}/dist/agent/${file}`);
}
copyFileSync(`${cwd}/src/project-control.css`, `${cwd}/dist/project-control.css`);
mkdirSync(`${cwd}/dist/resources`, { recursive: true });
copyFileSync(`${cwd}/src/resources/resource-card.css`, `${cwd}/dist/resources/resource-card.css`);
mkdirSync(`${cwd}/dist/knowledge`, { recursive: true });
copyFileSync(`${cwd}/src/knowledge/autorag-workflow.css`, `${cwd}/dist/knowledge/autorag-workflow.css`);
mkdirSync(`${cwd}/dist/widgets`, { recursive: true });
copyFileSync(`${cwd}/src/widgets/widgets.css`, `${cwd}/dist/widgets/widgets.css`);
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });

mkdirSync(`${cwd}/dist/design`, { recursive: true });
copyFileSync(`${cwd}/src/design/design-workspace.css`, `${cwd}/dist/design/design-workspace.css`);
mkdirSync(`${cwd}/dist/shell`, { recursive: true });
copyFileSync(`${cwd}/src/shell/inspector-picker.css`, `${cwd}/dist/shell/inspector-picker.css`);
copyFileSync(`${cwd}/src/shell/appearance.mjs`, `${cwd}/dist/shell/appearance.mjs`);
copyFileSync(`${cwd}/src/shell/appearance.d.mts`, `${cwd}/dist/shell/appearance.d.mts`);
mkdirSync(`${cwd}/dist/workflows`, { recursive: true });
copyFileSync(`${cwd}/src/workflows/workflow-studio.css`, `${cwd}/dist/workflows/workflow-studio.css`);
