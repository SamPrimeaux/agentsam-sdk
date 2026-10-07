import assert from "node:assert/strict";
import test from "node:test";
import {
  beginGmailOAuth,
  isGmailOAuthCallbackRequest,
} from "../../apps/local-studio/backend/worker/gmail-service.js";

function fakeDb(calls) {
  return {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async run() {
          calls.push({ kind: "run", sql, args: this.args });
          return { meta: { changes: 1 } };
        },
        async first() {
          calls.push({ kind: "first", sql, args: this.args });
          return null;
        },
      };
    },
  };
}

test("Gmail OAuth reuses the canonical Google callback and encrypted OAuth-state authority", async () => {
  const calls = [];
  const env = {
    DB: fakeDb(calls),
    GOOGLE_CLIENT_ID: "google-web-client",
    GOOGLE_CLIENT_SECRET: "google-web-secret",
    VAULT_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
  };
  const request = new Request("https://agentsam.inneranimalmedia.com/api/work/gmail/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ return_to: "/mail" }),
  });

  const response = await beginGmailOAuth(request, env, "acct_test");
  assert.equal(response.status, 200);
  const payload = await response.json();
  const authorize = new URL(payload.authorize_url);
  assert.equal(authorize.origin + authorize.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(
    authorize.searchParams.get("redirect_uri"),
    "https://agentsam.inneranimalmedia.com/api/oauth/google/callback",
  );
  assert.equal(authorize.searchParams.get("access_type"), "offline");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.match(authorize.searchParams.get("state") || "", /^gmail_/);
  const scopes = new Set((authorize.searchParams.get("scope") || "").split(" "));
  assert.ok(scopes.has("https://www.googleapis.com/auth/gmail.modify"));
  assert.ok(scopes.has("https://www.googleapis.com/auth/gmail.send"));

  const inserted = calls.find((entry) => /INSERT INTO oauth_state_nonces/.test(entry.sql));
  assert.ok(inserted, "PKCE state must use oauth_state_nonces");
  assert.ok(calls.every((entry) => !/agentsam_gmail_oauth_pending/.test(entry.sql)));
  assert.ok(inserted.args.some((value) => value === "google_gmail"));
  assert.ok(!inserted.args.includes("google-web-secret"));
});

test("Gmail callback dispatch is scoped by gmail_ state", () => {
  assert.equal(
    isGmailOAuthCallbackRequest(
      new Request("https://agentsam.inneranimalmedia.com/api/oauth/google/callback?state=gmail_abc&code=ok"),
    ),
    true,
  );
  assert.equal(
    isGmailOAuthCallbackRequest(
      new Request("https://agentsam.inneranimalmedia.com/api/oauth/google/callback?state=cli_abc&code=ok"),
    ),
    false,
  );
});
