import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalStudioPath,
  isStudioAdminPath,
  isStudioShellAdminPath,
  resolveLegacyContentMediaPath,
} from './studio-admin-routes.mjs';

test('legacy dashboard document paths canonicalize under /admin', () => {
  const cases = [
    ['/admin', '/admin/home'],
    ['/media', '/admin/media'],
    ['/analytics/overview', '/admin/analytics/overview'],
    ['/media/images', '/admin/media/images'],
    ['/chats/chat_123', '/admin/chats/chat_123'],
    ['/forms', '/admin/forms'],
    ['/settings/general', '/admin/settings/general'],
    ['/projects/project_123', '/admin/projects/project_123'],
    ['/artifacts/tickets/ticket_123', '/admin/artifacts/tickets/ticket_123'],
    ['/cad', '/admin/cad'],
    ['/admin/design-canvas', '/admin/canvas'],
    ['/admin/design-canvas/my-document', '/admin/canvas/my-document'],
    ['/agentsam/apps/cad', '/admin/cad'],
    ['/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fstore', '/admin/apps/ecommerce-cms-agentsam'],
    ['/store', '/admin/themes'],
    ['/themes', '/admin/themes'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(canonicalStudioPath(input.split('?')[0]), expected, input);
  }
});

test('canonical paths and public endpoints are not redirected', () => {
  for (const path of [
    '/admin/home',
    '/admin/media/images',
    '/admin/settings/general',
    '/admin/projects/project_123',
    '/api/studio/navigation',
    '/api/forms/public/form_123',
    '/forms/embed/form_123',
    '/forms/embed',
  ]) {
    assert.equal(canonicalStudioPath(path), null, path);
  }
});

test('Local Studio owns all admin URLs, while Ecommerce documents render outside the shell', () => {
  for (const pathname of ['/admin/media/images', '/admin/settings/general', '/admin/chats/chat_123',
    '/admin/analytics', '/admin/analytics/overview', '/admin/products', '/admin/orders', '/admin/pages']) {
    assert.equal(isStudioAdminPath(pathname), true, `host URL authority: ${pathname}`);
  }
  for (const pathname of ['/admin/media/images', '/admin/settings/general', '/admin/chats/chat_123', '/admin/analytics']) {
    assert.equal(isStudioShellAdminPath(pathname), true, `Studio shell: ${pathname}`);
  }
  for (const pathname of ['/admin/analytics/overview', '/admin/products', '/admin/orders', '/admin/pages']) {
    assert.equal(isStudioShellAdminPath(pathname), false, `packaged Ecommerce document: ${pathname}`);
  }
});

test('legacy Content kind redirects remain inside the admin Media Library', () => {
  assert.equal(resolveLegacyContentMediaPath('/admin/content', new URLSearchParams('kind=images')), '/admin/media/images');
  assert.equal(resolveLegacyContentMediaPath('/admin/content', new URLSearchParams('kind=videos')), '/admin/media/videos');
  assert.equal(resolveLegacyContentMediaPath('/admin/content', new URLSearchParams()), '/admin/media');
});
