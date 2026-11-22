import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('web shell uses the canonical admin ecommerce route and legacy routes redirect', () => {
  const shell = load('../frontend/agentsam/AgentSamShell.tsx');
  const ecommerce = load('../frontend/src/routes/(apps)/admin/apps/ecommerce-cms-agentsam.tsx');
  const legacy = load('../frontend/src/routes/(apps)/apps/ecommerce-cms-agentsam.tsx');
  assert.match(legacy, /<Navigate to="\/admin\/apps\/ecommerce-cms-agentsam"/);
  assert.match(shell, /navigate\(\{ to: '\/admin\/apps\/ecommerce-cms-agentsam', search: \{ page: to \} \} as never\)/);
  assert.doesNotMatch(shell, /window\.history\.replaceState\(window\.history\.state, '', to\)/);
  assert.doesNotMatch(ecommerce, /window\.history\.replaceState/);
  assert.match(ecommerce, /resolveEcommerceAdminPath\(search\.page/);
});

test('MovieMode uses host semantic roles in every mode instead of a second product palette', () => {
  const movie = load('../../agentsam-copro-studio/src/MovieModeApp.tsx');
  const standalone = load('../../agentsam-copro-studio/src/hostTheme.ts');
  const css = load('../../../packages/copro-ui/styles/copro.css');
  assert.doesNotMatch(movie, /data-nav-theme="dark"/);
  assert.match(standalone, /from "\.\.\/\.\.\/local-studio\/shared\/shell-appearance\.mjs"/);
  for (const [role, host] of [['bg','canvas'],['accent','accent'],['text','ink']]) {
    assert.ok(css.includes(`--copro-${role}: var(--copro-theme-${role}, var(--nav-${host}))`));
  }
  assert.match(css, /--mm-design-paper:var\(--copro-bg\)/);
  assert.doesNotMatch(css, /#[a-f0-9]{3,8}/i);
});
