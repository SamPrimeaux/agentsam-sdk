import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CMS_AUTHORIZED_SITES_SQL,
  canAccessCmsSite,
  listAuthorizedCmsSites,
} from './cms-site-scope.js';

test('unauthenticated catalog discovery never queries shared D1', async () => {
  const db = { prepare() { throw new Error('must_not_query'); } };
  assert.deepEqual(await listAuthorizedCmsSites(db, ''), []);
  assert.deepEqual(await listAuthorizedCmsSites(db, null), []);
});

test('catalog discovery binds the authenticated user to every ownership route', async () => {
  let executed = null;
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          executed = { sql, params };
          return { all: async () => ({ results: [
            { slug: 'inneranimalmedia', name: 'Inner Animal Media', domain: 'inneranimalmedia.com', page_count: 10 },
            { slug: 'project-x', name: null, domain: '', page_count: 2 },
          ] }) };
        },
      };
    },
  };
  const sites = await listAuthorizedCmsSites(db, 'iam_user_123');
  assert.deepEqual(executed.params, ['iam_user_123', 'iam_user_123', 'iam_user_123']);
  assert.match(executed.sql, /owner_user_id = \?/);
  assert.match(executed.sql, /workspace_members/);
  assert.match(executed.sql, /workspaces/);
  assert.deepEqual(sites[0], { id: 'inneranimalmedia', slug: 'inneranimalmedia', name: 'Inner Animal Media', domain: 'inneranimalmedia.com', page_count: 10 });
  assert.deepEqual(sites[1], { id: 'project-x', slug: 'project-x', name: 'project-x', domain: null, page_count: 2 });
  assert.equal(canAccessCmsSite(sites, 'inneranimalmedia'), true);
  assert.equal(canAccessCmsSite(sites, 'unknown'), false);
});

test('SQL filters site by active page and authenticated membership', () => {
  assert.match(CMS_AUTHORIZED_SITES_SQL, /is_active/);
  assert.match(CMS_AUTHORIZED_SITES_SQL, /wm\.user_id = \?/);
  assert.match(CMS_AUTHORIZED_SITES_SQL, /wm\.is_active/);
});
