#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const workbenchRoot = path.resolve(
  packageRoot,
  '../agentsam-workbench',
);

const manifestPath = path.join(
  workbenchRoot,
  'package.json',
);

const markers = [
  'dist/index.d.ts',
  'dist/shell/index.d.ts',
];

if (!fs.existsSync(manifestPath)) {
  process.exit(0);
}

const manifest = JSON.parse(
  fs.readFileSync(manifestPath, 'utf8'),
);

if (
  manifest.name !==
  '@inneranimalmedia/agentsam-workbench'
) {
  throw new Error(
    `Unexpected local workbench package: ${
      manifest.name || '<missing>'
    }`,
  );
}

const missing = markers.filter(
  (marker) =>
    !fs.existsSync(
      path.join(workbenchRoot, marker),
    ),
);

if (missing.length > 0) {
  console.log(
    '[shell-kit] building linked ' +
    '@inneranimalmedia/agentsam-workbench',
  );

  execFileSync(
    'npm',
    ['run', 'build'],
    {
      cwd: workbenchRoot,
      stdio: 'inherit',
    },
  );
}

const stillMissing = markers.filter(
  (marker) =>
    !fs.existsSync(
      path.join(workbenchRoot, marker),
    ),
);

if (stillMissing.length > 0) {
  throw new Error(
    '@inneranimalmedia/agentsam-workbench ' +
    'build completed without: ' +
    stillMissing.join(', '),
  );
}
