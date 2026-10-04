import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTSAM_ABS_THEME_TOKENS,
  getAbsThemeCssVariables,
} from '../dist/theme.js';

test('ABS flagship palette remains authoritative', () => {
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appBg, '#090A0E');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appSurface1, '#101117');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appSurface2, '#171822');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appTextPrimary, '#F7F5FB');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appTextSecondary, '#B5B1C0');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appAccent, '#8B5CF6');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appAccentSoft, '#B69AF8');
  assert.equal(AGENTSAM_ABS_THEME_TOKENS.appSuccess, '#4ADE9B');
});

test('ABS CSS projection is deterministic', () => {
  const vars = getAbsThemeCssVariables();
  assert.equal(vars['--app-bg'], '#090A0E');
  assert.equal(vars['--app-accent'], '#8B5CF6');
});
