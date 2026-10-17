import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  initApplicationAccount,
  ensureApplicationAccount,
  requireApplicationAccountId,
  __setApplicationAccountId,
} from "../backend/lib/account-context.js";

function envWith(rows) {
  const calls = [];
  return {
    calls,
    DB: {
      prepare(sql) {
        calls.push(sql);
        return { bind() { return this; }, async first() { return rows[0] ?? null; }, async all() { return { results: rows }; } };
      },
    },
  };
}

beforeEach(() => __setApplicationAccountId(null));

test("the account is never guessed: access before initialization throws", () => {
  assert.throws(() => requireApplicationAccountId(), /application_account_not_initialized/);
});

test("init resolves the sole active account once and caches it", async () => {
  const env = envWith([{ id: "acct_a" }]);
  assert.equal(await initApplicationAccount(env), "acct_a");
  assert.equal(requireApplicationAccountId(), "acct_a");
  const queries = env.calls.length;
  assert.equal(await initApplicationAccount(env), "acct_a");
  assert.equal(env.calls.length, queries, "a resolved account must not be queried again");
});

test("no account, or more than one, fails closed", async () => {
  await assert.rejects(initApplicationAccount(envWith([])), /application_account_missing/);
  await assert.rejects(initApplicationAccount(envWith([{ id: "a" }, { id: "b" }])), /application_account_ambiguous/);
  assert.throws(() => requireApplicationAccountId(), /not_initialized/);
});

test("the entry-point wrapper logs instead of throwing, so health and setup routes still answer", async () => {
  const realError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  try {
    assert.equal(await ensureApplicationAccount(envWith([])), null);
  } finally {
    console.error = realError;
  }
  assert.match(logged[0], /application_account_unresolved/);
  assert.throws(() => requireApplicationAccountId(), /not_initialized/, "account-scoped code still fails closed");
});
