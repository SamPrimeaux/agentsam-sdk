#!/usr/bin/env node
/**
 * Compatibility command for Local Studio's verified desktop artifact pipeline.
 * Product builds stay product-owned; no hosted/SSR/bootstrap fallback is shipped.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageDesktopFromArgs } from './stage-desktop-dist.mjs';

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  stageDesktopFromArgs(process.argv.slice(2), {
    defaultManifest: path.join(shellRoot, 'manifests/local-studio.json'),
    defaultSource: path.resolve(shellRoot, '../../apps/local-studio/desktop-dist'),
  });
} catch (error) {
  console.error('[sync-local-studio-dist] ' + error.message);
  process.exitCode = 1;
}
