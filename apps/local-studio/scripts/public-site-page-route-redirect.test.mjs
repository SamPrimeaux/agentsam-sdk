import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePublishedPageSource } from '../backend/worker/public-site.js';

function mockDb({ direct = [], aliases = [] } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {bind(...args) {
        calls.push({sql, args});
        return {async all() {
          if (sql.includes('route_redirects')) return {results:aliases};
          return {results:direct};
        }};
      }};
    },
  };
  return {db,calls};
}

test('old public URL redirects only to a published route belonging to the requested site', async () => {
  const site = {id:'s1',slug:'example'};
  const {db,calls} = mockDb({aliases:[{route_path:'/pages/new-url'}]});
  const found = await resolvePublishedPageSource(db,site,'/pages/old-url');
  assert.deepEqual(found,{redirectTo:'/pages/new-url'});
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].args[0],site.id);
  assert.match(calls[1].sql,/status='published'/);
  assert.match(calls[1].sql,/route_redirects/);
});

test('direct published URL takes precedence over a previous alias', async () => {
  const site = {id:'s1',slug:'example'};
  const {db,calls}=mockDb({direct:[{id:'p1',route_path:'/pages/new-url',content_object_key:'sites/example/public/page.html'}],aliases:[{route_path:'/pages/unused'}]});
  const found=await resolvePublishedPageSource(db,site,'/pages/new-url');
  assert.equal(found.key,'sites/example/public/page.html');
  assert.equal(calls.length,1);
});

test('unrecognized and ambiguous redirects fail closed', async () => {
  const site={id:'s1',slug:'example'};
  assert.equal(await resolvePublishedPageSource(mockDb().db,site,'/missing'),null);
  await assert.rejects(resolvePublishedPageSource(mockDb({aliases:[{route_path:'/a'},{route_path:'/b'}]}).db,site,'/old'),/ambiguous/);
});
