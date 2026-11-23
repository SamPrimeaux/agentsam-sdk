import test from 'node:test';
import assert from 'node:assert/strict';
import { accountAppsErrorMessage, AdminAppsDirectory } from '../dist/index.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('obsolete desktop native bridge reports update required rather than zero apps', () => {
  assert.match(accountAppsErrorMessage(new Error('unsupported_studio_service_operation')), /Update the desktop app/);
  assert.match(accountAppsErrorMessage(new Error('studio_service_apps_path_invalid')), /Update the desktop app/);
});

test('account auth and service outages are distinct from an empty app registry', () => {
  assert.match(accountAppsErrorMessage(new Error('apps_account_sign_in_required')), /Sign in again/);
  assert.match(accountAppsErrorMessage(new Error('apps_account_service_unavailable')), /temporarily unavailable/);
  assert.match(accountAppsErrorMessage(new Error('arbitrary internal error')), /Could not verify/);
});

test('unverified account Apps never renders a false zero count', () => {
  const html = renderToStaticMarkup(createElement(AdminAppsDirectory, {
    loadApps: async () => [], installApp: async () => {},
  }));
  assert.match(html, /Installed \(—\)/);
  assert.match(html, /Browse \(—\)/);
  assert.doesNotMatch(html, /Installed \(0\)/);
});
