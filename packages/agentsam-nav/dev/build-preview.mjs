/* Only run on a developer machine. This entry is never part of package exports or production builds. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(dir, '../../..');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim();
execFileSync(process.execPath, [resolve(dir, 'build-inventory.mjs')], {cwd:root,stdio:'inherit', env:{...process.env,AGENTSAM_SOURCE_SHA:revision}});
execFileSync(process.execPath, [resolve(dir, 'build-cms-stage.mjs')], {cwd:root,stdio:'inherit'});
execFileSync(process.execPath, [resolve(root,'apps/design-canvas/scripts/generate-documents.mjs')], {cwd:root,stdio:'inherit'});
cpSync(resolve(root,'apps/design-canvas/public/sources'), resolve(dir,'.generated/design-sources'),{recursive:true,force:true});
await build({
  entryPoints: [new URL('ComponentPreview.tsx', import.meta.url).pathname],
  outdir: dir + '.generated',
  bundle: true, platform: 'browser', format: 'iife',
  jsx: 'automatic', target: 'es2022',
  alias: {'@': resolve(root, 'apps/local-studio/frontend/src'), 'react': resolve(root, 'apps/local-studio/node_modules/react'), 'react-dom': resolve(root, 'apps/local-studio/node_modules/react-dom')},
  sourcemap: false, minify: false,
  logLevel: 'info',
});
console.log('Preview built: serve packages/agentsam-nav at http://localhost:4176/dev/');
