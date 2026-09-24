import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cad = fileURLToPath(new URL('../../cad-creator/', import.meta.url));
const target = fileURLToPath(new URL('../frontend/public/cad-creator/', import.meta.url));

if (process.argv.includes('--stage')) {
  const output = fileURLToPath(new URL('../.output/public/cad-creator/', import.meta.url));
  cpSync(target, output, { recursive: true });
  console.log('[cad-frontend] Staged CAD assets into the canonical Worker asset output.');
  process.exit(0);
}

/**
 * Cloudflare Workers Builds installs only apps/local-studio (build root).
 * CAD is a sibling package with its own lockfile — install it before vite build.
 */
function ensureCadInstalled() {
  const vitePkg = `${cad}/node_modules/vite/package.json`;
  const tailwindPkg = `${cad}/node_modules/@tailwindcss/vite/package.json`;
  if (existsSync(vitePkg) && existsSync(tailwindPkg)) {
    console.log('[cad-frontend] CAD node_modules present — skipping npm ci');
    return;
  }
  if (!existsSync(`${cad}/package-lock.json`)) {
    throw new Error(`[cad-frontend] missing ${cad}/package-lock.json`);
  }
  console.log('[cad-frontend] Installing CAD workspaces (npm ci)…');
  execFileSync('npm', ['ci'], { cwd: cad, stdio: 'inherit', env: process.env });
}

ensureCadInstalled();
execFileSync(
  'npm',
  ['run', 'build', '-w', '@inneranimalmedia/agentsam-cad-frontend', '--', '--base=/cad-creator/'],
  { cwd: cad, stdio: 'inherit' }
);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(`${cad}/frontend/dist`, target, { recursive: true });
console.log('[cad-frontend] Built apps/cad-creator into Local Studio static assets.');
