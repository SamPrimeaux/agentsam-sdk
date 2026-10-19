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

    // Tests intentionally exercise synthetic absolute paths (for example,
    // /Users/alice/...) when validating prompt/path rendering. The portability
    // guard targets product, docs, fixtures, generated assets, and protocol
    // artifacts rather than test-vector literals.
    if (file.startsWith('test/') || file.includes('/test/') || file.includes('/tests/')) continue;

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

// evidence-leak-guard: no concrete project ids or dev ports in tracked source.
// Patterns only: the guard must never spell out the values it forbids.
const evidenceProjectId = /proj_[a-z0-9]{6,}_[a-z0-9]{4,}/;
const evidenceDevPort = /\b5303\b/;
const evidenceLoopbackPort = /127\.0\.0\.1:\d+/;
const evidenceScoped = (file) => file.startsWith('src/sam/packs/evidence/') || /^protocol\/capabilities\/evidence-/.test(file);
const evidenceSkipped = (file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file) || file.includes('/deploy-merkle/');

test('tracked source contains no concrete project ids or dev ports', () => {
  const files = execFileSync('git', ['ls-files', '-z']).toString().split('\0').filter(Boolean);
  const failures = [];
  for (const file of files) {
    const dot = file.lastIndexOf('.');
    if (allowedExtensions.has(dot >= 0 ? file.slice(dot).toLowerCase() : '')) continue;
    if (file.startsWith('test/') || file.includes('/test/') || file.includes('/tests/') || evidenceSkipped(file)) continue;
    let source;
    try { source = readFileSync(file, 'utf8'); } catch { continue; }
    source.split('\n').forEach((line, index) => {
      const hits = [evidenceDevPort.test(line) && 'dev port'];
      if (evidenceScoped(file)) hits.push(evidenceProjectId.test(line) && 'project id', evidenceLoopbackPort.test(line) && 'loopback port');
      for (const hit of hits.filter(Boolean)) failures.push(`${file}:${index + 1}: ${hit}`);
    });
  }
  assert.deepEqual(failures, [], `Project-specific values found:\n${failures.join('\n')}`);
});
