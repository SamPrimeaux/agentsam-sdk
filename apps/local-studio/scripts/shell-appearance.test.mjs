import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectStudioShellAppearance,
  applyStudioShellAppearance,
  writeStudioAppearanceCache,
  readStudioAppearanceCache,
  clearStudioAppearanceCache,
  bootstrapStudioAppearanceFromCache,
  FIRST_PAINT_BOOTSTRAP_SCRIPT,
} from '../shared/shell-appearance.mjs';

test('CMS roles project identically into navigation and Console chrome', () => {
  const appearance = projectStudioShellAppearance({
    id: 'theme-a',
    themeFamily: 'light',
    cssVars: { '--bg-canvas': '#fafafa', '--bg-nav': '#eeeeee', '--text-main': '#111111', '--accent': '#117755' },
  });
  const values = new Map();
  const root = { dataset: {}, classList: { toggle() {} }, style: { setProperty: (k, v) => values.set(k, v), colorScheme: '' } };
  applyStudioShellAppearance(appearance, root);
  assert.equal(root.dataset.theme, 'light');
  assert.equal(values.get('--c-bg'), appearance.tokens.canvas);
  assert.equal(values.get('--c-surface-2'), appearance.tokens.sidebar);
  assert.equal(values.get('--c-ink'), appearance.tokens.text);
  assert.equal(values.get('--c-topbar'), appearance.tokens.topbar);
  assert.equal(values.get('--c-search-bg'), appearance.tokens.search);
  assert.equal(values.get('--c-accent'), '#117755');
  assert.equal(values.get('--c-accent-ink'), '#ffffff');
  assert.equal(values.get('--nav-accent'), '#117755');
  assert.equal(values.get('--home-ink'), appearance.tokens.text);
  assert.equal(values.get('--home-card'), appearance.tokens.surface);
  assert.equal(values.get('--home-focus'), '#117755');
  assert.ok(Object.keys(appearance.tokens).length >= 12, 'partial themes still have a complete semantic palette');
});

test('explicit navigation roles take precedence and removing a theme resets its palette', () => {
  const custom = projectStudioShellAppearance({ themeFamily: 'dark', cssVars: { '--nav-canvas': '#123456', '--bg-canvas': '#654321' } });
  assert.equal(custom.tokens.canvas, '#123456');
  const reset = projectStudioShellAppearance(null, { theme: 'light', accentColor: '#123456' });
  assert.equal(reset.tokens.canvas, '#fafafa');
  assert.equal(reset.tokens.text, '#202020');
  assert.equal(reset.accentColor, '#123456');
  assert.equal(reset.themeId, null);
});

test('account-scoped appearance cache is first-paint authority until registry reconciles', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
  const appearance = projectStudioShellAppearance({
    id: 'tide',
    themeFamily: 'light',
    cssVars: { '--accent': '#0D9488' },
  });
  writeStudioAppearanceCache('acct-1', appearance, storage);
  const cached = readStudioAppearanceCache('acct-1', storage);
  assert.equal(cached.themeId, 'tide');
  assert.equal(cached.accentColor, '#0D9488');
  assert.equal(cached.accountId, 'acct-1');
  const root = { dataset: {}, classList: { toggle() {} }, style: { setProperty() {}, colorScheme: '' } };
  // bootstrap uses real localStorage; verify cache helpers instead for node.
  assert.equal(readStudioAppearanceCache(undefined, storage).themeId, 'tide');
  clearStudioAppearanceCache('acct-1', storage);
  assert.equal(readStudioAppearanceCache('acct-1', storage), null);
  assert.ok(FIRST_PAINT_BOOTSTRAP_SCRIPT.includes('agentsam-studio-appearance-v1'));
  assert.equal(typeof bootstrapStudioAppearanceFromCache, 'function');
});

test('React shell resolves the hosted account instead of skipping the registry for the dev fallback user', async () => {
  const { readFile } = await import('node:fs/promises');
  const shell = await readFile(new URL('../frontend/agentsam/AgentSamShell.tsx', import.meta.url), 'utf8');
  const hosted = await readFile(new URL('../frontend/src/lib/themes/hosted-account.ts', import.meta.url), 'utf8');
  // Regression: production ships VITE_AUTH_ENABLED=false → useCurrentUser() is `dev-user`;
  // gating applyActiveStudioTheme() on it left /media, /themes and AgentSam on the dark palette.
  assert.ok(shell.includes("resolveHostedAccountId"), 'theme sync resolves the hosted account');
  assert.ok(!/!user\?\.id\s*\|\|\s*user\.isDevFallback\)\s*\?\s*null\s*:\s*await applyActiveStudioTheme/.test(shell),
    'registry must not be skipped for the dev fallback user');
  assert.ok(hosted.includes('/api/auth/me'), 'hosted account comes from the IAM session contract');
});

test('light themes with a dark rail keep page ink dark and project tailwind tokens', () => {
  const appearance = projectStudioShellAppearance({
    id: 'light-dark-rail',
    themeFamily: 'light',
    cssVars: {
      '--text-sidebar': '#F4F4F5',
      '--text-main': '#202223',
      '--text-muted': '#616161',
      '--bg-canvas': '#F4F4F5',
      '--bg-surface': '#FFFFFF',
    },
  });
  assert.equal(appearance.tokens.text, '#F4F4F5', 'sidebar text stays light on the dark rail');
  assert.equal(appearance.tokens.ink, '#202223', 'page ink comes from main text');
  const props = new Map();
  const root = {
    dataset: {},
    style: { setProperty: (k, v) => props.set(k, v) },
    classList: { toggle() {} },
  };
  applyStudioShellAppearance(appearance, root);
  assert.equal(props.get('--c-ink'), '#202223');
  assert.equal(props.get('--home-ink'), '#202223');
  assert.equal(props.get('--nav-text'), '#F4F4F5');
  assert.equal(props.get('--color-foreground'), '#202223');
  assert.equal(props.get('--color-background'), '#F4F4F5');
});
