import test from "node:test";
import assert from "node:assert/strict";
import { listAuthorizedCmsSites, requireCmsSiteAccess } from "./cms-authority.js";

const OWNER = "au_siteowner56789";
const OTHER = "au_otheractor123";
const owned = [
  {
    id: "site_sdk", account_id: OWNER, slug: "agentsam-sdk",
    name: "AgentSam SDK", primary_domain: "agentsam.inneranimalmedia.com",
    worker_id: "wr_agentsam_sdk", status: "active",
    project_id: "proj_agentsam_sdk", project_slug: "agentsam-sdk"
  },
  {
    id: "site_empty", account_id: OWNER, slug: "new-site",
    name: "New site", primary_domain: null, worker_id: null,
    status: "draft", project_id: null, project_slug: null
  },
  {
    id: "site_remote", account_id: OWNER, slug: "fuelnfreetime",
    name: "Fuel N Free Time", primary_domain: "fuelnfreetime.com",
    worker_id: "fuelnfreetime", status: "active",
    project_id: null, project_slug: null
  },
  {
    id: "site_private", account_id: OTHER, slug: "other-business",
    name: "Private customer", primary_domain: null, worker_id: null,
    status: "active", project_id: null, project_slug: null
  },
];
function fixture(projectRows = []) {
  return {
    prepare(sql) {
      if (/FROM projects p/.test(sql)) return {
        bind(...actors) {
          assert.equal(actors.length, 7);
          assert.ok(actors.every(a => a === actors[0]));
          return { all: async () => ({ results: projectRows.filter(
            row => actors[0] === OWNER
          ) }) };
        }
      };
      if (/FROM cms_sites s/.test(sql)) {
        assert.match(sql, /s.account_id\s*=\s*\?/);
        assert.match(sql, /s.status\s*!=\s*'archived'/);
        assert.match(sql, /s.worker_id IS NULL OR p.id IS NOT NULL/);
        return { bind(actor) { return { all: async () => ({
          results: owned.filter(row => row.account_id === actor &&
            row.status !== "archived" && (!row.worker_id || row.project_id))
        }) }; } };
      }
      throw new Error("Unexpected database query: " + sql);
    }
  };
}

test("SDK source website is visible by its real CMS site identity without requiring a legacy projects row", async () => {
  const db = fixture();
  const sites = await listAuthorizedCmsSites(db, OWNER);
  assert.deepEqual(sites.map(s => s.slug), ["agentsam-sdk", "new-site"]);
  const sdk = sites[0];
  assert.equal(sdk.id, "site_sdk");
  assert.equal(sdk.project_id, "proj_agentsam_sdk");
  assert.equal(sdk.source, "shared-d1");
  assert.equal(sdk.can_edit, true);
  assert.equal(sdk.can_publish, true);
  const access = await requireCmsSiteAccess(db, OWNER, "agentsam-sdk", "write");
  assert.equal(access.ok, true);
  assert.equal(access.site.id, "site_sdk");
});

test("cross-account CMS sites and unconfigured remote sites are not exposed", async () => {
  const db = fixture();
  assert.deepEqual(await listAuthorizedCmsSites(db, OTHER), [
    {
      id: "site_private", slug: "other-business", name: "Private customer",
      domain: null, project_id: "site_private", tenant_id: null,
      workspace_id: null, worker_id: null, source: "shared-d1",
      role: "owner", can_edit: true, can_publish: true
    }
  ]);
  assert.equal((await requireCmsSiteAccess(db, OTHER, "agentsam-sdk")).status, 404);
  assert.equal((await requireCmsSiteAccess(db, OWNER, "fuelnfreetime")).status, 404);
});

test("configured signed Worker source wins over an archived local projection", async () => {
  const db = fixture([{
    project_id: "proj_fuelnfreetime", name: "Fuel N Free Time",
    domain: "fuelnfreetime.com", worker_id: "fuelnfreetime",
    metadata_json: "{}", tenant_id: "tenant_owner", workspace_id: "ws_owner",
    role: "owner", cms_slug: null
  }]);
  const sites = await listAuthorizedCmsSites(db, OWNER, {
    remoteWorkerNames: ["fuelnfreetime"]
  });
  const fuel = sites.find(s => s.slug === "fuelnfreetime");
  assert.equal(fuel.source, "worker");
  assert.equal(fuel.project_id, "proj_fuelnfreetime");
  assert.equal(fuel.can_publish, true);
});
