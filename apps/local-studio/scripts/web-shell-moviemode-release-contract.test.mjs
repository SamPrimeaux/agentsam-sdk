import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('web shell uses registered ecommerce route and never mutates it to an unregistered /admin path', () => {
  const shell = load('../frontend/agentsam/AgentSamShell.tsx');
  const ecommerce = load('../frontend/src/routes/(apps)/apps/ecommerce-cms-agentsam.tsx');
  assert.match(shell, /navigate\(\{ to: '\/apps\/ecommerce-cms-agentsam', search: \{ page: to \} \} as never\)/);
  assert.doesNotMatch(shell, /window\.history\.replaceState\(window\.history\.state, '', to\)/);
  assert.doesNotMatch(ecommerce, /window\.history\.replaceState/);
  assert.match(ecommerce, /resolveEcommerceAdminPath\(search\.page/);
});

test('MovieMode retains a product-scoped dark/cyan palette irrespective of host appearance', () => {
  const movie = load('../../agentsam-copro-studio/src/MovieModeApp.tsx');
  const css = load('../../../packages/copro-ui/styles/copro.css');
  assert.match(movie, /data-nav-theme="dark"/);
  assert.doesNotMatch(movie, /useShellAppearance\(/);
  assert.match(css, /\.copro-app-root \.mm-home/);
  assert.match(css, /--copro-bg\s*:\s*var\(--copro-theme-bg,#0b1015\)/);
  assert.match(css, /--copro-accent\s*:\s*var\(--copro-theme-accent,#32c6ca\)/);
});
