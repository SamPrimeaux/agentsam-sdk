import test from "node:test";
import assert from "node:assert/strict";
import { listAuthorizedCmsSites, requireCmsSiteAccess, resolveCmsSiteAccess, readCmsSiteSelector, createAuthorizedCmsSite } from "./cms-authority.js";

const OWNER = "au_siteowner56789";
const OTHER = "au_otheractor123";
const owned = [
  {
    id: "site_sdk", account_id: OWNER, slug: "agentsam-sdk",
    name: "AgentSam SDK", primary_domain: "agentsam.inneranimalmedia.com",
    worker_id: "wr_agentsam_sdk", status: "active", has_pages: 1,
  },
  {
    id: "site_empty", account_id: OWNER, slug: "new-site",
    name: "New site", primary_domain: null, worker_id: null,
    status: "draft", has_pages: 0,
  },
  {
    id: "site_remote", account_id: OWNER, slug: "fuelnfreetime",
    name: "Fuel N Free Time", primary_domain: "fuelnfreetime.com",
    worker_id: "fuelnfreetime", status: "active", has_pages: 0,
  },
  {
    id: "site_private", account_id: OTHER, slug: "other-business",
    name: "Private customer", primary_domain: null, worker_id: null,
    status: "active", has_pages: 0,
  },
];

function fixture(projectRows = []) {
  return {
    prepare(sql) {
      if (/FROM projects p/.test(sql)) return {
        bind(...actors) {
          assert.equal(actors.length, 7);
          assert.ok(actors.every(a => a === actors[0]));
          assert.doesNotMatch(sql, /cms_pages|project_slug/);
          return { all: async () => ({ results: actors[0] === OWNER ? projectRows : [] }) };
        },
      };
      if (/FROM cms_sites s/.test(sql)) {
        assert.match(sql, /s.account_id\s*=\s*\?/);
        assert.match(sql, /s.status\s*!=\s*'archived'/);
        assert.match(sql, /cp.site_id\s*=\s*s.id/);
        assert.match(sql, /cp.status\s*<>\s*'archived'/);
        assert.doesNotMatch(sql, /project_id|project_slug|is_active|is_homepage/);
        return { bind(actor) { return { all: async () => ({
          results: owned.filter(row => row.account_id === actor &&
            row.status !== "archived" && (!row.worker_id || row.has_pages)),
        }) }; } };
      }
      throw new Error("Unexpected database query: " + sql);
    },
  };
}

test("SDK site is visible from cms_sites without legacy page/project identity", async () => {
  const db = fixture();
  const sites = await listAuthorizedCmsSites(db, OWNER);
  assert.deepEqual(sites.map(s => s.slug), ["agentsam-sdk", "new-site"]);
  const sdk = sites[0];
  assert.equal(sdk.id, "site_sdk");
  assert.equal(sdk.account_id, OWNER);
  assert.equal(Object.hasOwn(sdk, "project_id"), false);
  assert.equal(Object.hasOwn(sdk, "workspace_id"), false);
  assert.equal(sdk.source, "shared-d1");
  assert.equal(sdk.can_edit, true);
  assert.equal(sdk.can_publish, true);
  assert.equal((await requireCmsSiteAccess(db, OWNER, "agentsam-sdk", "write")).ok, true);
  assert.equal((await requireCmsSiteAccess(db, OWNER, "site_sdk", "write")).ok, true);
});

test("cross-account sites and unconfigured remote sites are not exposed", async () => {
  const db = fixture();
  assert.deepEqual(await listAuthorizedCmsSites(db, OTHER), [
    {
      id: "site_private", account_id: OTHER, slug: "other-business", name: "Private customer",
      domain: null, primary_domain: null, domain_aliases_json: null, settings_json: null,
      worker_id: null, status: "active", is_default: false, updated_at: null, page_count: 0,
      source: "shared-d1", role: "owner", can_edit: true, can_publish: true,
    },
  ]);
  assert.equal((await requireCmsSiteAccess(db, OTHER, "agentsam-sdk")).status, 404);
  assert.equal((await requireCmsSiteAccess(db, OWNER, "fuelnfreetime")).status, 404);
});

test("configured signed Worker source wins over an archived local projection", async () => {
  const db = fixture([{
    project_id: "proj_fuelnfreetime", name: "Fuel N Free Time",
    domain: "fuelnfreetime.com", worker_id: "fuelnfreetime",
    metadata_json: "{}", tenant_id: "tenant_owner", workspace_id: "ws_owner",
    role: "owner",
  }]);
  const sites = await listAuthorizedCmsSites(db, OWNER, {
    remoteWorkerNames: ["fuelnfreetime"],
  });
  const fuel = sites.find(s => s.slug === "fuelnfreetime");
  assert.equal(fuel.source, "worker");
  assert.equal(fuel.project_id, "proj_fuelnfreetime");
  assert.equal(fuel.can_publish, true);
});


test("site-scoped operations require an explicit authorized site; project IDs are not site selectors", async () => {
  const db = fixture();
  assert.deepEqual(await resolveCmsSiteAccess(db, OWNER, null, 'read'), {
    ok: false, status: 400, error: 'cms_site_required',
  });
  assert.equal((await resolveCmsSiteAccess(db, OWNER, 'site_sdk', 'read')).site.id, 'site_sdk');
  assert.equal((await resolveCmsSiteAccess(db, OWNER, 'project_sdk', 'read')).status, 404);
  const request = new Request('https://studio.example/api/cms/pages?project_id=site_sdk&project_slug=agentsam-sdk');
  assert.equal(await readCmsSiteSelector(request), null);
});


test('Local Studio creates the site row under its authenticated account and shared settings contract', async () => {
  const account = OWNER;
  const captured = { insert: null, defaultUpdate: null };
  const row = {
    id: 'cmssite_created12345678', account_id: account, name: 'New customer site',
    slug: 'new-customer-site', primary_domain: 'example.com', domain_aliases_json: '[]',
    status: 'draft', is_default: 0, created_at: 'now', updated_at: 'now',
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          if (/SELECT id FROM cms_sites WHERE account_id/.test(sql)) return { first: async () => null };
          if (/INSERT INTO cms_sites/.test(sql)) return { run: async () => { captured.insert = values; } };
          if (/UPDATE cms_sites SET is_default/.test(sql)) return { run: async () => { captured.defaultUpdate = values; } };
          if (/FROM cms_sites WHERE id/.test(sql)) return { first: async () => row };
          throw new Error('Unexpected create query: ' + sql);
        },
      };
    },
  };
  const created = await createAuthorizedCmsSite(db, account, {
    name: row.name, slug: row.slug, primary_domain: row.primary_domain,
    status: 'draft', is_default: false, settings: { store: { homeTitle: 'A real site' } },
  });
  assert.equal(created.id, row.id);
  assert.equal(captured.insert[1], account, 'tenant comes from the authenticated actor');
  assert.equal(captured.insert[3], row.slug);
  assert.equal(captured.insert[7], 'draft');
  assert.equal(captured.insert[8], 0);
  const settings = JSON.parse(captured.insert[6]);
  assert.equal(settings.store.homeTitle, 'A real site');
  assert.equal(settings.store.navigationAuthority, 'cms');
  assert.equal(captured.defaultUpdate, null, 'an explicitly non-default draft cannot replace the current default');
});
