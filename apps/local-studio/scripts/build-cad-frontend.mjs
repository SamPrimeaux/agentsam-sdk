import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cad = fileURLToPath(new URL('../../cad-creator/', import.meta.url));
const target = fileURLToPath(new URL('../frontend/public/cad-creator/', import.meta.url));
if (process.argv.includes('--stage')) {
  const output = fileURLToPath(new URL('../.output/public/cad-creator/', import.meta.url));
  cpSync(target, output, { recursive: true });
  console.log('[cad-frontend] Staged CAD assets into the canonical Worker asset output.');
  process.exit(0);
}
execFileSync('npm', ['run', 'build', '-w', '@inneranimalmedia/agentsam-cad-frontend', '--', '--base=/cad-creator/'], { cwd: cad, stdio: 'inherit' });
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(`${cad}/frontend/dist`, target, { recursive: true });
console.log('[cad-frontend] Built apps/cad-creator into Local Studio static assets.');
