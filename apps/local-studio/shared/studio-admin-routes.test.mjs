import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalStudioPath,
  isStudioAdminPath,
  resolveLegacyContentMediaPath,
} from './studio-admin-routes.mjs';

test('legacy dashboard document paths canonicalize under /admin', () => {
  const cases = [
    ['/admin', '/admin/home'],
    ['/media', '/admin/media'],
    ['/media/images', '/admin/media/images'],
    ['/chats/chat_123', '/admin/chats/chat_123'],
    ['/forms', '/admin/forms'],
    ['/settings/general', '/admin/settings/general'],
    ['/projects/project_123', '/admin/projects/project_123'],
    ['/artifacts/tickets/ticket_123', '/admin/artifacts/tickets/ticket_123'],
    ['/cad', '/admin/cad'],
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

test('Studio route ownership does not swallow Ecommerce-owned admin routes', () => {
  assert.equal(isStudioAdminPath('/admin/media/images'), true);
  assert.equal(isStudioAdminPath('/admin/settings/general'), true);
  assert.equal(isStudioAdminPath('/admin/chats/chat_123'), true);
  assert.equal(isStudioAdminPath('/admin/products'), false);
  assert.equal(isStudioAdminPath('/admin/orders'), false);
  assert.equal(isStudioAdminPath('/admin/pages'), false);
});

test('legacy Content kind redirects remain inside the admin Media Library', () => {
  assert.equal(resolveLegacyContentMediaPath('/admin/content', new URLSearchParams('kind=images')), '/admin/media/images');
  assert.equal(resolveLegacyContentMediaPath('/admin/content', new URLSearchParams('kind=videos')), '/admin/media/videos');
  assert.equal(resolveLegacyContentMediaPath('/admin/content', new URLSearchParams()), '/admin/media');
});
