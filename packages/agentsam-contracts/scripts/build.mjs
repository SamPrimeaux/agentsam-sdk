import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const modules = ['index','agent','events','run','tools','operations','source-types','authority','execution','providers','hooks','artifacts','context','adapter','models','identity','repository','errors','widgets','spawn-policy','resource-scope','design-workspace','design-workspace-registry','scene-format'];
// Build into a staging directory and swap it in, so concurrent readers (tests,
// packed consumers) never observe a missing dist/ while this package rebuilds.
const live = `${cwd}/dist`;
const staging = `${cwd}/.dist-staging`;
const previous = `${cwd}/.dist-previous`;
rmSync(staging, { recursive: true, force: true });
rmSync(previous, { recursive: true, force: true });
const repoRoot = path.resolve(cwd, '../..');
const schemasDir = path.join(cwd, 'schemas');
mkdirSync(schemasDir, { recursive: true });
for (const name of ['source-types.v2.json', 'source-types.v2.schema.json']) {
  copyFileSync(path.join(repoRoot, 'contracts', name), path.join(schemasDir, name));
}
await build({
  absWorkingDir: cwd,
  entryPoints: Object.fromEntries(modules.map((name) => [name, `src/${name}.ts`])),
  outdir: staging,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
});
execFileSync('tsc', ['-p', 'tsconfig.build.json', '--outDir', staging], { cwd, stdio: 'inherit' });
if (existsSync(live)) renameSync(live, previous);
renameSync(staging, live);
rmSync(previous, { recursive: true, force: true });
