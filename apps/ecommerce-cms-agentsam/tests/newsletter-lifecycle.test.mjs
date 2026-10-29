import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  handleNewsletterSignup,
  handleNewsletterConfirm,
  handleNewsletterUnsubscribe,
} from "../backend/storefront/newsletter.js";
import { queryNewsletterSubscribers } from "../backend/storefront/newsletter-admin.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE newsletter_subscribers (
    id TEXT PRIMARY KEY DEFAULT ('sub_' || lower(hex(randomblob(8)))),
    email TEXT NOT NULL UNIQUE CHECK(email = lower(trim(email)) AND instr(email,'@') > 1),
    first_name TEXT, last_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','subscribed','unsubscribed','bounced','complained')),
    source_type TEXT NOT NULL DEFAULT 'form', source_ref TEXT, source_path TEXT,
    attribution_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attribution_json)),
    consent_text TEXT, consent_ip_hash TEXT, confirm_token_hash TEXT, confirmed_at TEXT,
    subscribed_at TEXT, unsubscribed_at TEXT,
    unsubscribe_token TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json)='array'),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
    last_event_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), provider_contact_id TEXT
  );`);
  function statement(sql, params = []) {
    return {
      bind(...nextParams) { return statement(sql, nextParams); },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes || 0) } };
      },
    };
  }
  const DB = { prepare(sql) { return statement(sql); } };
  return { sqlite, DB };
}

function signupRequest(body) {
  return new Request("https://fuelnfreetime.com/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mailFixture(t) {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: `email_test_${sent.length}` }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return sent;
}

function testEnv(DB) {
  return {
    DB,
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM_EMAIL: "Fuel & Free Time <hello@fuelnfreetime.com>",
  };
}

function tokenFromConfirmationMail(mail) {
  const match = mail.html.match(/href="([^"]*\/api\/newsletter\/confirm\?token=[a-f0-9]{64})"/i);
  assert.ok(match, "confirmation email includes a one-time confirmation URL");
  return new URL(match[1]);
}

test("signup saves a pending record with hashed token and sends Resend confirmation", async (t) => {
  const { sqlite, DB } = fixture();
  const sent = mailFixture(t);
  const env = testEnv(DB);
  try {
    const response = await handleNewsletterSignup(signupRequest({
      email: "  Sam@FuelNFreeTime.com ", first_name: "Sam", source_page: "/",
      source_type: "footer", source_ref: "global-footer",
      attribution: { utm_source: "direct", not_allowed: "ignored" },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true, status: "pending", message: "Check your inbox for a confirmation link to finish subscribing.",
    });
    const row = sqlite.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get("sam@fuelnfreetime.com");
    assert.equal(row.status, "pending");
    assert.equal(row.first_name, "Sam");
    assert.equal(row.source_type, "footer");
    assert.equal(row.source_path, "/");
    assert.equal(row.source_ref, "global-footer");
    assert.deepEqual(JSON.parse(row.attribution_json), { utm_source: "direct" });
    assert.match(row.confirm_token_hash, /^[a-f0-9]{64}$/);
    const confirmationUrl = tokenFromConfirmationMail(sent[0]);
    const token = confirmationUrl.searchParams.get("token");
    const { createHash } = await import("node:crypto");
    assert.equal(row.confirm_token_hash, createHash("sha256").update(token).digest("hex"));
    assert.notEqual(row.confirm_token_hash, token, "the raw confirmation token is never stored");
    assert.ok(JSON.parse(row.metadata_json).confirmation_expires_at);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to[0], "sam@fuelnfreetime.com");
    assert.match(sent[0].subject, /Confirm your Fuel & Free Time subscription/);
  } finally { sqlite.close(); }
});

test("confirmation activates the subscriber, sends a welcome email, and unsubscribe suppresses future sends", async (t) => {
  const { sqlite, DB } = fixture();
  const sent = mailFixture(t);
  const env = testEnv(DB);
  try {
    await handleNewsletterSignup(signupRequest({ email: "sam@fuelnfreetime.com" }), env);
    const confirmationUrl = tokenFromConfirmationMail(sent[0]);
    const confirmed = await handleNewsletterConfirm(new Request(confirmationUrl), env, confirmationUrl);
    assert.equal(confirmed.status, 200);
    assert.match(await confirmed.text(), /email is confirmed/i);
    const row = sqlite.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get("sam@fuelnfreetime.com");
    assert.equal(row.status, "subscribed");
    assert.ok(row.confirmed_at);
    assert.ok(row.subscribed_at);
    assert.equal(row.confirm_token_hash, null);
    assert.equal(sent.length, 2, "confirmation and welcome messages are sent");
    const unsubscribeMatch = sent[1].html.match(/href="([^"]*\/api\/newsletter\/unsubscribe\?token=[a-f0-9]{32})"/i);
    assert.ok(unsubscribeMatch, "welcome email includes an unsubscribe link");
    const unsubscribeUrl = new URL(unsubscribeMatch[1]);
    const unsubscribed = await handleNewsletterUnsubscribe(new Request(unsubscribeUrl), env, unsubscribeUrl);
    assert.equal(unsubscribed.status, 200);
    assert.match(await unsubscribed.text(), /unsubscribed/i);
    const finalRow = sqlite.prepare("SELECT status, unsubscribed_at FROM newsletter_subscribers WHERE email = ?").get("sam@fuelnfreetime.com");
    assert.equal(finalRow.status, "unsubscribed");
    assert.ok(finalRow.unsubscribed_at);
  } finally { sqlite.close(); }
});

test("invalid emails and unavailable Resend do not create subscriber records", async (t) => {
  const { sqlite, DB } = fixture();
  mailFixture(t);
  try {
    const invalid = await handleNewsletterSignup(signupRequest({ email: "not-an-email" }), testEnv(DB));
    assert.equal(invalid.status, 400);
    const unavailable = await handleNewsletterSignup(signupRequest({ email: "sam@fuelnfreetime.com" }), { DB });
    assert.equal(unavailable.status, 503);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM newsletter_subscribers").get().n, 0);
  } finally { sqlite.close(); }
});

test("expired confirmation links are rejected and invalidated", async (t) => {
  const { sqlite, DB } = fixture();
  const sent = mailFixture(t);
  const env = testEnv(DB);
  try {
    await handleNewsletterSignup(signupRequest({ email: "sam@fuelnfreetime.com" }), env);
    const confirmationUrl = tokenFromConfirmationMail(sent[0]);
    const token = confirmationUrl.searchParams.get("token");
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    sqlite.prepare("UPDATE newsletter_subscribers SET metadata_json = ? WHERE email = ?")
      .run(JSON.stringify({ confirmation_expires_at: "2000-01-01T00:00:00.000Z" }), "sam@fuelnfreetime.com");
    const response = await handleNewsletterConfirm(new Request(confirmationUrl), env, confirmationUrl);
    assert.equal(response.status, 410);
    const row = sqlite.prepare("SELECT status, confirm_token_hash, metadata_json FROM newsletter_subscribers WHERE email = ?").get("sam@fuelnfreetime.com");
    assert.equal(row.status, "pending");
    assert.equal(row.confirm_token_hash, null);
    assert.equal(JSON.parse(row.metadata_json).confirmation_expires_at, null);
    assert.equal(hash.length, 64);
  } finally { sqlite.close(); }
});


test("admin subscriber API reads the new schema, filters safely, and returns lifecycle counts", async () => {
  const { sqlite, DB } = fixture();
  try {
    sqlite.prepare(`INSERT INTO newsletter_subscribers (id,email,status,source_type,source_path,created_at)
      VALUES ('sub_a','sam@fuelnfreetime.com','subscribed','footer','/','2026-10-29 01:00:00')`).run();
    sqlite.prepare(`INSERT INTO newsletter_subscribers (id,email,status,source_type,source_path,created_at)
      VALUES ('sub_b','pending@example.com','pending','cms_block','/home','2026-10-29 01:01:00')`).run();
    sqlite.prepare(`INSERT INTO newsletter_subscribers (id,email,status,source_type,source_path,created_at)
      VALUES ('sub_c','gone@example.com','unsubscribed','footer','/','2026-10-29 01:02:00')`).run();
    const url = new URL('https://fuelnfreetime.com/api/admin/subscribers?status=subscribed&q=sam');
    const payload = await queryNewsletterSubscribers({ DB }, url);
    assert.equal(payload.subscribers.length, 1);
    assert.equal(payload.subscribers[0].email, 'sam@fuelnfreetime.com');
    assert.equal(payload.subscribers[0].source_path, '/');
    assert.equal(payload.summary.total, 3);
    assert.equal(payload.summary.subscribed, 1);
    assert.equal(payload.summary.pending, 1);
    assert.equal(payload.summary.unsubscribed, 1);
  } finally { sqlite.close(); }
});
