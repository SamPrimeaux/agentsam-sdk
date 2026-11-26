import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const loginSource = fileURLToPath(import.meta.resolve('@inneranimalmedia/agentsam-identity/frontend/auth-portal/pages/login.html'));
const sourceRoot = path.resolve(path.dirname(loginSource), '..');
const pagesSource = path.join(sourceRoot, 'pages');
const sharedSource = path.join(sourceRoot, 'shared');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(appRoot, 'frontend/static/identity-portal');

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, 'pages'), { recursive: true });
await cp(sharedSource, path.join(outputRoot, 'shared'), { recursive: true });

for (const page of ['login.html', 'signup.html', 'reset.html']) {
  const source = await readFile(path.join(pagesSource, page), 'utf8');
  const output = source.replaceAll('/shared/', '/identity-portal/shared/');
  await writeFile(path.join(outputRoot, 'pages', page), output);
}

process.stdout.write(`Synced canonical Identity portals to ${path.relative(appRoot, outputRoot)}\n`);
