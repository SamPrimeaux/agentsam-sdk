/* Only run on a developer machine. This entry is never part of package exports or production builds. */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
await build({
  entryPoints: [new URL('ComponentPreview.tsx', import.meta.url).pathname],
  outdir: dir + '.generated',
  bundle: true, platform: 'browser', format: 'iife',
  jsx: 'automatic', target: 'es2022',
  sourcemap: true, minify: false,
  logLevel: 'info',
});
console.log('Preview built: serve packages/agentsam-nav at http://localhost:4176/dev/');
