#!/usr/bin/env node
/**
 * Cloudflare Workers Builds uses Node 22 + npm 10.9.2 and `npm ci`.
 * Fail if the Local Studio lockfile cannot satisfy lru-cache@11.5.2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = { name: 'lru-cache', version: '11.5.2' };
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const lockPath = path.join(appRoot, 'package-lock.json');

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (lock.lockfileVersion !== 3) {
  console.error(`lockfileVersion ${lock.lockfileVersion} is not 3`);
  process.exit(1);
}
const pkgs = lock.packages || {};
const hits = Object.entries(pkgs).filter(([, meta]) => meta?.version === REQUIRED.version && String(meta.resolved || '').includes(`${REQUIRED.name}-${REQUIRED.version}`));
const named = Object.entries(pkgs).filter(([key, meta]) => key.includes(REQUIRED.name) && meta?.version === REQUIRED.version);
if (!named.length && !hits.length) {
  console.error(`Missing: ${REQUIRED.name}@${REQUIRED.version} from lock file`);
  process.exit(1);
}
console.log(`ok npm10 lock: ${REQUIRED.name}@${REQUIRED.version} (${named.map(([k]) => k).join(', ') || 'resolved'})`);
