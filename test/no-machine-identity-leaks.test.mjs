import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forbidden = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /file:\/\/\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
];

const allowedExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.woff', '.woff2', '.ttf', '.ico',
]);

test('tracked source contains no developer-specific absolute home paths', () => {
  const files = execFileSync('git', ['ls-files', '-z'])
    .toString()
    .split('\0')
    .filter(Boolean);

  const failures = [];

  for (const file of files) {
    const dot = file.lastIndexOf('.');
    const ext = dot >= 0 ? file.slice(dot).toLowerCase() : '';

    if (allowedExtensions.has(ext)) continue;

    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = source.split('\n');

    lines.forEach((line, index) => {
      if (forbidden.some((pattern) => pattern.test(line))) {
        failures.push(`${file}:${index + 1}: ${line.trim().slice(0, 180)}`);
      }
    });
  }

  assert.deepEqual(
    failures,
    [],
    `Developer-specific filesystem paths found:\n${failures.join('\n')}`,
  );
});
