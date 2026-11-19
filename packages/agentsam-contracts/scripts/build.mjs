import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const modules = ['index','agent','events','run','tools','operations','source-types','authority','execution','providers','hooks','artifacts','context','adapter','models','identity','repository','errors','widgets','spawn-policy','resource-scope','design-workspace','design-workspace-registry'];
rmSync(`${cwd}/dist`, { recursive: true, force: true });
const repoRoot = path.resolve(cwd, '../..');
const schemasDir = path.join(cwd, 'schemas');
mkdirSync(schemasDir, { recursive: true });
for (const name of ['source-types.v2.json', 'source-types.v2.schema.json']) {
  copyFileSync(path.join(repoRoot, 'contracts', name), path.join(schemasDir, name));
}
await build({
  absWorkingDir: cwd,
  entryPoints: Object.fromEntries(modules.map((name) => [name, `src/${name}.ts`])),
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
});
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
