import assert from "node:assert/strict";
import test from "node:test";
import {
  beginConnectorOAuth,
  completeConnectorOAuth,
  connectorForCallback,
  disconnectConnector,
  handleConnectorWorkRequest,
  isConnectorWorkRequest,
} from "./connector-oauth.js";

function fakeDb() {
  const log = [];
  let nonce = null;
  return {
    log,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              log.push({ sql, args });
              if (/^INSERT INTO oauth_state_nonces/.test(sql)) {
                nonce = { id: args[0], user_id: args[1], provider: args[2], state_hash: args[3],
                  code_verifier_encrypted: args[4], redirect_after: args[5], expires_at: args[7], consumed_at: null };
              }
              if (/^UPDATE oauth_state_nonces SET consumed_at/.test(sql)) {
                if (!nonce || nonce.consumed_at) return { meta: { changes: 0 } };
                nonce.consumed_at = args[0];
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              log.push({ sql, args });
              if (/FROM oauth_state_nonces/.test(sql)) return nonce && nonce.state_hash === args[0] && nonce.provider === args[1] ? nonce : null;
              if (/FROM agentsam_plugins/.test(sql)) return { id: "plg_test_" + args[0] };
              return null;
            },
            async all() { log.push({ sql, args }); return { results: [] }; },
          };
        },
        async run() { log.push({ sql, args: [] }); return { meta: { changes: 1 } }; },
      };
    },
  };
}

const env = () => ({
  DB: fakeDb(),
  VAULT_MASTER_KEY: "a".repeat(64),
  GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret",
  GITHUB_CLIENT_ID: "ghid", GITHUB_CLIENT_SECRET: "ghsecret",
});

const post = (path, body) => new Request("https://agentsam.inneranimalmedia.com" + path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
});

test("route matcher only admits the three connector providers", () => {
  assert.ok(isConnectorWorkRequest("/api/work/connect/github/start"));
  assert.ok(isConnectorWorkRequest("/api/work/connect/google_calendar/disconnect"));
  assert.ok(!isConnectorWorkRequest("/api/work/connect/google_gmail/start"));
  assert.ok(!isConnectorWorkRequest("/api/work/connect/github/start/extra"));
});

for (const [key, authHost, cb, prefix] of [
  ["google_drive", "accounts.google.com", "/api/oauth/google/callback", "gdrive_"],
  ["google_calendar", "accounts.google.com", "/api/oauth/google/callback", "gcal_"],
  ["github", "github.com", "/api/oauth/github/callback", "ghub_"],
]) {
  test(`${key}: start -> callback persists encrypted grant and installation`, async (t) => {
    const e = env();
    const res = await beginConnectorOAuth(post(`/api/work/connect/${key}/start`, { return_to: "/settings/customize?view=plugins" }), e, "au_test", key);
    const { authorize_url } = await res.json();
    const auth = new URL(authorize_url);
    assert.equal(auth.host, authHost);
    assert.equal(auth.searchParams.get("redirect_uri"), "https://agentsam.inneranimalmedia.com" + cb);
    const state = auth.searchParams.get("state");
    assert.ok(state.startsWith(prefix));
    assert.ok(auth.searchParams.get("code_challenge"));

    const callback = new Request("https://agentsam.inneranimalmedia.com" + cb + "?code=abc&state=" + state);
    assert.equal(connectorForCallback(callback)?.provider, key);

    const realFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = realFetch; });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token")) return Response.json({ access_token: "at", refresh_token: key === "github" ? undefined : "rt", expires_in: key === "github" ? undefined : 3600, scope: "x y" });
      if (u.includes("api.github.com")) return Response.json({ login: "SamPrimeaux", name: "Sam" });
      return Response.json({ email: "Info@InnerAnimals.com" });
    };
    const done = await completeConnectorOAuth(callback, e);
    assert.equal(done.status, 302);
    const loc = new URL(done.headers.get("location"));
    assert.equal(loc.pathname, "/settings/customize");
    assert.equal(loc.searchParams.get("provider"), key);

    const upsert = e.DB.log.find((l) => /INSERT INTO user_oauth_tokens/.test(l.sql));
    assert.ok(upsert, "token upsert ran");
    assert.equal(upsert.args[1], key);
    assert.equal(upsert.args[2], key === "github" ? "SamPrimeaux" : "info@inneranimals.com");
    assert.notEqual(upsert.args[3], "at", "access token is sealed, not plaintext");
    assert.ok(e.DB.log.some((l) => /INSERT INTO agentsam_plugin_installations/.test(l.sql)));

    // state is single-use
    const replay = await completeConnectorOAuth(callback, e);
    assert.equal(replay.status, 400);
  });
}

test("disconnect revokes token and resets installation", async () => {
  const e = env();
  const out = await disconnectConnector(e, "au_test", "github:SamPrimeaux");
  assert.deepEqual(out, { ok: true, provider: "github" });
  assert.ok(e.DB.log.some((l) => /SET is_active = 0/.test(l.sql) && l.args.includes("SamPrimeaux")));
  assert.ok(e.DB.log.some((l) => /setup_status = 'unconfigured'/.test(l.sql)));
  await assert.rejects(() => disconnectConnector(e, "au_test", "google_gmail:x@y.z"), /connection_required/);
});

test("missing client config fails closed", async () => {
  const e = env(); e.GITHUB_CLIENT_SECRET = "";
  const res = await handleConnectorWorkRequest(post("/api/work/connect/github/start"), e, "au_test");
  assert.equal(res.status, 503);
});
