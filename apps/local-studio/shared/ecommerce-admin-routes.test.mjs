import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLocalStudioEcommerceAdminRoute } from './ecommerce-admin-routes.mjs';

test('one-off FNF scene demo routes are not part of Local Studio', () => {
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/scene-lab'), null);
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/scene-lab.html'), null);
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/bridge-fly-preview'), null);
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/bridge-fly-preview.html'), null);
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/preferences')?.id, 'admin.preferences');
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/collections')?.id, 'admin.collections');
});
