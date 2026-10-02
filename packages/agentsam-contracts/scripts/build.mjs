import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const modules = ['index','agent','events','tools','authority','execution','providers','hooks','artifacts','context','adapter','models','identity','repository','errors'];
rmSync(`${cwd}/dist`, { recursive: true, force: true });
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
