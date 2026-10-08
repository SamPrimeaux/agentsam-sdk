#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function relativeLuminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error('Only opaque six-digit hex tokens are supported: ' + hex);
  const n = match[1];
  const values = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const [r, g, b] = values.map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function auditThemeContrast(css) {
  const tokens = new Map([...css.matchAll(/(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)]
    .map((match) => [match[1], match[2]]));
  const pairs = [
    ['--color-foreground', '--color-background', 4.5],
    ['--color-card-foreground', '--color-card', 4.5],
    ['--color-popover-foreground', '--color-popover', 4.5],
    ['--color-primary-foreground', '--color-primary', 4.5],
    ['--color-secondary-foreground', '--color-secondary', 4.5],
    ['--color-muted-foreground', '--color-background', 4.5],
    ['--color-muted-foreground', '--color-card', 4.5],
    ['--color-accent-foreground', '--color-accent', 4.5],
  ];
  return pairs.map(([fg, bg, minimum]) => ({
    foreground: fg, background: bg, minimum,
    actual: tokens.get(fg) && tokens.get(bg) ? contrastRatio(tokens.get(fg), tokens.get(bg)) : null,
  }));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const file = process.argv[2] || 'apps/local-studio/frontend/src/styles.css';
  const css = fs.readFileSync(path.resolve(file), 'utf8');
  const results = auditThemeContrast(css);
  const failures = results.filter((x) => x.actual === null || x.actual < x.minimum);
  for (const pair of results) console.log(
    pair.foreground + ' on ' + pair.background + ' = ' +
    (pair.actual === null ? 'unresolved' : pair.actual.toFixed(2) + ':1') +
    (pair.actual === null || pair.actual < pair.minimum ? ' FAIL' : ' PASS')
  );
  console.log(failures.length ? 'Theme contrast NOT_READY' : 'Theme contrast PASS');
  if (failures.length) process.exitCode = 1;
}
