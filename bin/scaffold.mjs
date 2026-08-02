#!/usr/bin/env node
/**
 * agentsam scaffold
 * Usage:
 *   npx @inneranimalmedia/agentsam-sdk scaffold
 *   npx @inneranimalmedia/agentsam-sdk scaffold cms
 *   npx @inneranimalmedia/agentsam-sdk scaffold worker-api
 */

import { runScaffold } from '../src/lib/scaffold/index.js';

const type = process.argv[2] ?? null;

runScaffold(type).catch((err) => {
  console.error(err);
  process.exit(1);
});
