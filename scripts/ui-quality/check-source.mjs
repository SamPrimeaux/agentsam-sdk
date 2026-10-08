#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditUiSource } from './source-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const option = (key) => argv[argv.indexOf(key) + 1];
const explicit = argv.includes('--files') ? (option('--files') || '').split(',').filter(Boolean) : null;
const base = argv.includes('--changed-from') ? option('--changed-from') : null;
if (!explicit && !base) {
  console.error('Usage: node scripts/ui-quality/check-source.mjs --changed-from origin/main | --files path1,path2 [--json]');
  process.exit(2);
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const added = new Map();
let files = explicit ?? [];
if (base) {
  const diff = git('diff', '--unified=0', '--no-ext-diff', base + '...HEAD', '--');
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) file = line.slice(6);
    else if (file && line.startsWith('@@')) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      const lines = added.get(file) ?? new Set();
      for (let offset = 0; offset < count; offset++) lines.add(start + offset);
      added.set(file, lines);
    }
  }
  files = [...added.keys()];
}
const findings = [];
for (const name of files) {
  if (!/\.(tsx|jsx|html?)$/i.test(name)) continue;
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) continue;
  const all = auditUiSource(fs.readFileSync(full, 'utf8'), name);
  findings.push(...(base ? all.filter((issue) => {
    const lines = added.get(name);
    if (!lines) return false;
    for (let line = issue.line; line <= (issue.endLine ?? issue.line); line++) {
      if (lines.has(line)) return true;
    }
    return false;
  }) : all));
}
if (argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    status: findings.length ? 'NOT_READY' : 'PASS',
    scope: base ? 'changed_lines' : 'explicit_files',
    findings,
  }, null, 2) + '\n');
} else {
  for (const f of findings) console.error(f.file + ':' + f.line + ' [' + f.rule + '] ' + f.message);
  console.log('UI source ' + (findings.length ? 'FAIL' : 'PASS') +
    ' · ' + files.length + ' files · ' + findings.length + ' violations on changed lines');
}
if (findings.length) process.exitCode = 1;
