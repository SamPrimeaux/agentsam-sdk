#!/usr/bin/env node
/**
 * Clean, product-owned Ecommerce installs for Local Studio release staging.
 *
 * npm run sets npm_config_allow_scripts from package allowScripts/.npmrc.
 * Forwarding that inherited setting to a nested npm ci produces EALLOWSCRIPTS
 * on npm 11. The install policy is taken from each package.json instead.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

export function cleanInstallEnvironment(source = process.env) {
  const result = { ...source };
  for (const key of Object.keys(result)) {
    if (key.toLowerCase() === 'npm_config_allow_scripts') delete result[key];
  }
  return result;
}

export function installStudioDependencies({
  appDirectory = APP,
  environment = process.env,
  run = execFileSync,
} = {}) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = cleanInstallEnvironment(environment);
  for (const cwd of [appDirectory, path.join(appDirectory, 'frontend')]) {
    run(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd,
      stdio: 'inherit',
      env,
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installStudioDependencies();
}
