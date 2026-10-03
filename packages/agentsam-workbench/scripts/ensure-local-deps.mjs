#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const dependencies = [
  {
    name: '@inneranimalmedia/agentsam-contracts',
    root: path.resolve(packageRoot, '../agentsam-contracts'),
    markers: [
      'dist/index.d.ts',
    ],
  },
  {
    name: '@inneranimalmedia/agentsam-loading-scene',
    root: path.resolve(packageRoot, '../agentsam-loading-scene'),
    markers: [
      'dist/index.d.ts',
      'dist/react/index.d.ts',
    ],
  },
];

for (const dependency of dependencies) {
  const manifestPath = path.join(
    dependency.root,
    'package.json',
  );

  if (!fs.existsSync(manifestPath)) {
    continue;
  }

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  );

  if (manifest.name !== dependency.name) {
    throw new Error(
      `Unexpected local package at ${dependency.root}: ` +
      `${manifest.name || '<missing>'}`,
    );
  }

  const missing = dependency.markers.filter(
    (marker) =>
      !fs.existsSync(
        path.join(dependency.root, marker),
      ),
  );

  if (missing.length > 0) {
    console.log(
      `[workbench] building linked ${dependency.name}`,
    );

    execFileSync(
      'npm',
      ['run', 'build'],
      {
        cwd: dependency.root,
        stdio: 'inherit',
      },
    );
  }

  const stillMissing = dependency.markers.filter(
    (marker) =>
      !fs.existsSync(
        path.join(dependency.root, marker),
      ),
  );

  if (stillMissing.length > 0) {
    throw new Error(
      `${dependency.name} build completed without: ` +
      stillMissing.join(', '),
    );
  }
}
