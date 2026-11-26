import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { createCmsSite, ensureDefaultCmsSite } from "../backend/cms/site-context.mjs";
import { postStorePreferences } from "../backend/admin/store.js";
import { hashPassword as legacyAdminHashPassword } from "../backend/lib/auth.js";
import { verifyPassword as verifyIdentityPassword } from "@inneranimalmedia/agentsam-identity/core/password-crypto";
import {
  createStorefrontAccessToken,
  handleStorefrontAccessApi,
  storefrontAccessGate,
  verifyStorefrontAccessToken,
} from "../backend/storefront/access.js";

function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { const result = db.prepare(sql).run(...params); return { meta: { changes: result.changes } }; },
      };
      return statement;
    },
  };
}

async function savePreferences(DB, accountId, siteId, settings) {
  return postStorePreferences(
    new Request("https://admin.example/api/admin/store/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    }),
    { DB, CMS_SITE_CONTEXT: { id: siteId, account_id: accountId } },
    { accountId, siteId },
  );
}

async function siteFixture(domain = "store.example.test") {
  const sqlite = createCmsTestDb();
  sqlite.prepare("INSERT INTO accounts(id) VALUES ('merchant')").run();
  const DB = d1(sqlite);
  const site = await ensureDefaultCmsSite(DB, "merchant");
  sqlite.prepare("UPDATE cms_sites SET primary_domain=? WHERE id=?").run(domain, site.id);
  return { sqlite, DB, site };
}


test("merchant password writes enforce the 8–128 character policy server-side", async () => {
  const { sqlite, DB, site } = await siteFixture();
  try {
    for (const storePassword of ["short", "x".repeat(129)]) {
      const response = await savePreferences(DB, "merchant", site.id, {
        passwordProtection: true,
        storePassword,
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /between 8 and 128 characters/);
    }
  } finally {
    sqlite.close();
  }
});

test("store passwords use Identity credential primitives and accept existing admin PBKDF2 hashes", async () => {
  const legacyPassword = "legacy-store-password";
  const legacy = await legacyAdminHashPassword(legacyPassword);
  assert.equal(await verifyIdentityPassword(legacyPassword, legacy.salt, legacy.hash), true);

  const { sqlite, DB, site } = await siteFixture();
  try {
    const saved = await savePreferences(DB, "merchant", site.id, {
      passwordProtection: true,
      storePassword: "merchant-chosen-password",
    });
    assert.equal(saved.status, 200, await saved.clone().text());

    const root = JSON.parse(sqlite.prepare("SELECT settings_json FROM cms_sites WHERE id=?").get(site.id).settings_json);
    assert.equal(root.store.storePasswordSalt.length, 64, "Identity now writes a 256-bit salt");
    assert.equal(
      await verifyIdentityPassword("merchant-chosen-password", root.store.storePasswordSalt, root.store.storePasswordHash),
      true,
    );
    assert.equal("storePassword" in root.store, false, "plaintext is never persisted");
  } finally {
    sqlite.close();
  }
});

test("store access rejects empty and oversized passwords before password verification", async () => {
  const { sqlite, DB } = await siteFixture();
  try {
    const env = { DB };
    for (const password of ["", "x".repeat(129)]) {
      const request = new Request("https://store.example.test/api/storefront/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, return_to: "/" }),
      });
      const response = await handleStorefrontAccessApi(request, env, new URL(request.url));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "invalid_request");
    }
  } finally {
    sqlite.close();
  }
});

test("store password protection gates storefront pages and public APIs, then grants a site-bound session", async () => {
  const { sqlite, DB, site } = await siteFixture();
  try {
    const saved = await savePreferences(DB, "merchant", site.id, {
      passwordProtection: true,
      storePassword: "secure-store-password",
    });
    assert.equal(saved.status, 200, await saved.clone().text());

    const env = { DB };
    const pageRequest = new Request("https://store.example.test/products/one");
    const blockedPage = await storefrontAccessGate(pageRequest, env);
    assert.equal(blockedPage.status, 200);
    assert.match(await blockedPage.text(), /password protected/i);
    assert.equal(blockedPage.headers.get("x-robots-tag"), "noindex, nofollow");

    const apiRequest = new Request("https://store.example.test/api/store/products");
    const blockedApi = await storefrontAccessGate(apiRequest, env);
    assert.equal(blockedApi.status, 401);
    assert.equal((await blockedApi.json()).error, "store_password_required");

    const badForm = new URLSearchParams({ password: "wrong-password", return_to: "/products/one" });
    const badRequest = new Request("https://store.example.test/api/storefront/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: badForm,
    });
    const badResponse = await handleStorefrontAccessApi(badRequest, env, new URL(badRequest.url));
    assert.equal(badResponse.status, 401);

    const form = new URLSearchParams({ password: "secure-store-password", return_to: "/products/one?ref=mail" });
    const accessRequest = new Request("https://store.example.test/api/storefront/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form,
    });
    const accessResponse = await handleStorefrontAccessApi(accessRequest, env, new URL(accessRequest.url));
    assert.equal(accessResponse.status, 303);
    assert.equal(accessResponse.headers.get("location"), "https://store.example.test/products/one?ref=mail");
    const cookie = accessResponse.headers.get("set-cookie").split(";")[0];
    assert.match(cookie, /^__Host-iam-store-access=/);

    const authorizedRequest = new Request("https://store.example.test/products/one", { headers: { cookie } });
    assert.equal(await storefrontAccessGate(authorizedRequest, env), null);
    const adminRequest = new Request("https://store.example.test/admin/preferences");
    assert.equal(await storefrontAccessGate(adminRequest, env), null);
  } finally {
    sqlite.close();
  }
});

test("access tokens are signed, expire, and cannot be replayed on another CMS site", async () => {
  const key = { siteId: "site-a", passwordHash: "hash-a", passwordSalt: "salt-a", now: 1_000_000 };
  const token = await createStorefrontAccessToken(key);
  assert.equal(await verifyStorefrontAccessToken(token, key), true);
  assert.equal(await verifyStorefrontAccessToken(token, { ...key, siteId: "site-b" }), false);
  assert.equal(await verifyStorefrontAccessToken(token, { ...key, passwordHash: "hash-b" }), false);
  assert.equal(await verifyStorefrontAccessToken(token, { ...key, now: 1_000_000 + 8 * 24 * 60 * 60 * 1000 }), false);
});

test("password protection cannot be enabled without a saved password", async () => {
  const { sqlite, DB, site } = await siteFixture();
  try {
    const response = await savePreferences(DB, "merchant", site.id, { passwordProtection: true });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "store_password_required");
  } finally {
    sqlite.close();
  }
});

test("password changes invalidate previously issued access sessions", async () => {
  const { sqlite, DB, site } = await siteFixture();
  try {
    await savePreferences(DB, "merchant", site.id, { passwordProtection: true, storePassword: "first-store-password" });
    const env = { DB };
    const firstRequest = new Request("https://store.example.test/api/storefront/access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "first-store-password", return_to: "/" }),
    });
    const firstResponse = await handleStorefrontAccessApi(firstRequest, env, new URL(firstRequest.url));
    const cookie = firstResponse.headers.get("set-cookie").split(";")[0];
    assert.equal(await storefrontAccessGate(new Request("https://store.example.test/", { headers: { cookie } }), env), null);

    await savePreferences(DB, "merchant", site.id, { passwordProtection: true, storePassword: "second-store-password" });
    const oldSession = await storefrontAccessGate(new Request("https://store.example.test/", { headers: { cookie } }), env);
    assert.equal(oldSession.status, 200);
  } finally {
    sqlite.close();
  }
});

test("site passwords and access sessions stay isolated between sites", async () => {
  const { sqlite, DB, site } = await siteFixture();
  try {
    const second = await createCmsSite(DB, "merchant", { id: "second-store", name: "Second", slug: "second" });
    sqlite.prepare("UPDATE cms_sites SET primary_domain=? WHERE id=?").run("second.example.test", second.id);
    await savePreferences(DB, "merchant", site.id, { passwordProtection: true, storePassword: "first-store-password" });
    await savePreferences(DB, "merchant", second.id, { passwordProtection: true, storePassword: "second-store-password" });
    const env = { DB };
    const firstLogin = new Request("https://store.example.test/api/storefront/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "first-store-password", return_to: "/" }),
    });
    const firstResponse = await handleStorefrontAccessApi(firstLogin, env, new URL(firstLogin.url));
    const cookie = firstResponse.headers.get("set-cookie").split(";")[0];
    const secondStoreRequest = new Request("https://second.example.test/", { headers: { cookie } });
    const blocked = await storefrontAccessGate(secondStoreRequest, env);
    assert.equal(blocked.status, 200);
  } finally {
    sqlite.close();
  }
});
