import test from "node:test";
import assert from "node:assert/strict";
import {
  __setApplicationAccountId,
  requireApplicationAccountId,
  resolveApplicationAccountId,
  withApplicationAccount,
} from "../backend/lib/account-context.js";

function multiAccountEnv(ids = ["acct_a", "acct_b"]) {
  const seen = [];
  return {
    seen,
    DB: {
      prepare(sql) {
        const query = { sql, id: null };
        return {
          bind(id) {
            query.id = id;
            return this;
          },
          async first() {
            seen.push(query);
            return ids.includes(query.id) ? { id: query.id } : null;
          },
          async all() {
            seen.push(query);
            return { results: ids.map((id) => ({ id })) };
          },
        };
      },
    },
  };
}

test("authenticated scopes keep concurrent tenant requests isolated", async () => {
  __setApplicationAccountId("legacy_single_tenant");
  const env = multiAccountEnv();
  try {
    const request = (id) => withApplicationAccount(env, id, async () => {
      assert.equal(requireApplicationAccountId(), id);
      await Promise.resolve();
      assert.equal(await resolveApplicationAccountId(env), id);
      await Promise.resolve();
      assert.equal(requireApplicationAccountId(), id);
      return id;
    });
    const returned = await Promise.all([request("acct_a"), request("acct_b")]);
    assert.deepEqual(returned, ["acct_a", "acct_b"]);
    assert.deepEqual(
      env.seen.map((query) => query.id).sort(),
      ["acct_a", "acct_b"],
      "each account was validated once before entering its own context",
    );
    assert.equal(requireApplicationAccountId(), "legacy_single_tenant", "no scoped value escapes the request");
  } finally {
    __setApplicationAccountId(null);
  }
});

test("explicit cross-account lookup is denied from inside a signed-in scope", async () => {
  const env = multiAccountEnv();
  await withApplicationAccount(env, "acct_a", async () => {
    await assert.rejects(resolveApplicationAccountId(env, "acct_b"), /application_account_scope_mismatch/);
    await assert.rejects(
      withApplicationAccount(env, "acct_b", async () => "should never run"),
      /application_account_scope_mismatch/,
    );
    assert.equal(requireApplicationAccountId(), "acct_a");
  });
});

test("a missing or disabled account cannot establish a tenant scope", async () => {
  __setApplicationAccountId(null);
  const env = multiAccountEnv(["acct_a"]);
  await assert.rejects(
    withApplicationAccount(env, "acct_b", async () => "unreachable"),
    /application_account_not_configured/,
  );
  assert.throws(() => requireApplicationAccountId(), /application_account_not_initialized/);
});

test("unscoped multi-tenant discovery still fails closed", async () => {
  __setApplicationAccountId(null);
  await assert.rejects(resolveApplicationAccountId(multiAccountEnv()), /application_account_ambiguous/);
});
