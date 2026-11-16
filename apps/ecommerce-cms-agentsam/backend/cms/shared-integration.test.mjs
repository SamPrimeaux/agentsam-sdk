import test from 'node:test';
import assert from 'node:assert/strict';
import { withLocalStudioCmsContext as appContext, getApplicationAccountContext } from '../lib/account-context.js';
import { withLocalStudioCmsContext as packageContext, withApplicationAccount } from '@inneranimalmedia/agentsam-cms/account-context';
import { DEFAULT_SITE_STORE_SETTINGS as packageDefaults, mergeSiteSettings as packageMerge } from '@inneranimalmedia/agentsam-cms/site-settings';
import { DEFAULT_SITE_STORE_SETTINGS as appDefaults, mergeSiteSettings as appMerge } from './site-settings-contract.mjs';
import { DEFAULT_NAV_ITEMS } from '../lib/site-nav.js';

const site = { id: 'site_a', account_id: 'tenant_a', name: 'A' };

test('installed CMS and Studio use the same account-scoped context, never separate singleton state', async () => {
  assert.strictEqual(appContext, packageContext);
  assert.equal(getApplicationAccountContext(), null);
  await packageContext('tenant_a', site, async () => {
    assert.equal(getApplicationAccountContext().accountId, 'tenant_a');
    assert.equal(getApplicationAccountContext().site.id, 'site_a');
    assert.equal(await withApplicationAccount({}, 'tenant_a', async () => getApplicationAccountContext().actorUserId), 'tenant_a');
    await assert.rejects(() => withApplicationAccount({}, 'tenant_b', async () => null), /application_account_scope_mismatch/);
  });
  assert.equal(getApplicationAccountContext(), null);
  assert.throws(() => appContext('tenant_b', site, async () => null), /local_studio_cms_site_account_mismatch/);
});

test('host and installed CMS share identical neutral site defaults, with no customer data', () => {
  assert.strictEqual(appDefaults, packageDefaults);
  assert.strictEqual(DEFAULT_NAV_ITEMS, packageDefaults.navItems);
  const input = { store: { homeTitle: 'User page', passwordProtection: true }, custom: 'kept' };
  assert.deepEqual(appMerge(input), packageMerge(input));
  assert.equal(appMerge(input).store.passwordProtection, true);
  assert.equal(appMerge(input).store.navLogoUrl, '');
});
