import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${cwd}/dist`, { recursive: true, force: true });
mkdirSync(`${cwd}/dist`, { recursive: true });
await build({ absWorkingDir: cwd, entryPoints: ['src/index.ts', 'src/browser.tsx'], outdir: 'dist', bundle: true, packages: 'external', format: 'esm', target: 'es2022', jsx: 'automatic' });
await build({ absWorkingDir: cwd, entryPoints: ['src/browser.tsx'], outfile: 'dist/browser.global.js', bundle: true, format: 'iife', globalName: 'AgentSamNav', target: 'es2022', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, minify: true });
execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
copyFileSync(`${cwd}/src/shell.css`, `${cwd}/dist/theme.css`);
copyFileSync(`${cwd}/src/theme.css`, `${cwd}/dist/legacy.css`);
copyFileSync(`${cwd}/src/shell.css`, `${cwd}/dist/shell.css`);
