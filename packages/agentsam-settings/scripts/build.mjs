import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const cwd = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${cwd}/dist`, { recursive: true, force: true });
await esbuildBuild({
  absWorkingDir: cwd,
  entryPoints: {
    index: 'src/index.ts',
    appearance: 'src/appearance.ts',
    'contracts/index': 'src/contracts/index.ts',
    'frontend/index': 'src/frontend/index.tsx',
    'fixtures/index': 'src/fixtures/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'lucide-react'],
});
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });

// Ship the utility CSS with the package. Consumers do not need to scan node_modules
// or recreate Local Studio's Tailwind configuration to render Settings correctly.
await viteBuild({
  configFile: false,
  root: cwd,
  plugins: [tailwindcss()],
  build: {
    outDir: `${cwd}/dist/frontend`,
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: `${cwd}/scripts/portable-styles.ts`,
      output: { assetFileNames: 'index.css', entryFileNames: '_settings_styles.js' },
    },
  },
});
rmSync(`${cwd}/dist/frontend/_settings_styles.js`, { force: true });
// Keep the legacy root stylesheet in sync with the public frontend stylesheet.
copyFileSync(`${cwd}/dist/frontend/index.css`, `${cwd}/dist/index.css`);
