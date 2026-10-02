#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localContracts = path.resolve(packageRoot, '../agentsam-contracts');
const manifestPath = path.join(localContracts, 'package.json');
const distMarker = path.join(localContracts, 'dist/index.d.ts');

if (fs.existsSync(manifestPath) && !fs.existsSync(distMarker)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== '@inneranimalmedia/agentsam-contracts') {
    throw new Error('Unexpected local contracts package: ' + (manifest.name || '<missing>'));
  }
  console.log('[workbench] building linked agentsam-contracts dependency');
  execFileSync('npm', ['run', 'build'], { cwd: localContracts, stdio: 'inherit' });
}

if (fs.existsSync(manifestPath) && !fs.existsSync(distMarker)) {
  throw new Error('agentsam-contracts build completed without dist/index.d.ts');
}
