import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCmsWorkerRequest } from './cms-service.js';

const user = 'iam_user_test';
function fakeEnv() {
  return {
    DB: {
      prepare(sql) {
        if (!sql.includes('FROM cms_pages cp')) throw new Error('unexpected_db_access');
        return {
          bind(...ids) {
            assert.deepEqual(ids, [user, user, user]);
            return {
              all: async () => ({ results: [
                { slug: 'inneranimalmedia', name: 'Inner Animal Media', domain: 'inneranimalmedia.com', page_count: 10 },
              ] }),
            };
          },
        };
      },
    },
  };
}

test('CMS website discovery is read-only and session-scoped', async () => {
  const result = await handleCmsWorkerRequest(
    new Request('https://studio.example/api/cms/websites'),
    fakeEnv(),
    { userId: user },
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.websites.map((site) => site.slug), ['inneranimalmedia']);
});

test('CMS endpoints deny unauthenticated users before reading D1', async () => {
  const response = await handleCmsWorkerRequest(
    new Request('https://studio.example/api/cms/websites'),
    { DB: { prepare() { throw new Error('db_must_not_be_read'); } } },
  );
  assert.equal(response.status, 401);
});

test('CMS site slug supplied by caller does not confer access', async () => {
  const response = await handleCmsWorkerRequest(
    new Request('https://studio.example/api/cms/pages?site=another-company'),
    fakeEnv(),
    { userId: user },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: 'cms_site_not_allowed' });
});

test('CMS OPTIONS preflight remains available', async () => {
  const response = await handleCmsWorkerRequest(
    new Request('https://studio.example/api/cms/pages?site=inneranimalmedia', { method: 'OPTIONS' }),
    {},
  );
  assert.equal(response.status, 204);
});
