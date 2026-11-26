import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/core/password-crypto.js";
import {
  createPasswordGateToken,
  verifyPasswordGateToken,
} from "../src/core/password-gate.js";
import { renderStorePasswordPortal } from "../src/frontend/auth-portal/store-access.js";

test("identity password-gate grants are site-bound, expire and rotate with the credential", async () => {
  const { hashHex, saltHex } = await hashPassword("merchant-selected-password");
  const input = {
    siteId: "site-a",
    passwordHash: hashHex,
    passwordSalt: saltHex,
    signingSecret: 'test-storefront-signing-secret-at-least-32-bytes',
    now: 1_000_000,
  };
  const token = await createPasswordGateToken(input);

  assert.equal(await verifyPasswordGateToken(token, input), true);
  assert.equal(await verifyPasswordGateToken(token, { ...input, siteId: "site-b" }), false);
  assert.equal(await verifyPasswordGateToken(token, { ...input, passwordHash: "rotated-hash" }), false);
  assert.equal(await verifyPasswordGateToken(token, { ...input, signingSecret: 'different-storefront-secret-at-least-32-bytes' }), false);
  assert.equal(await verifyPasswordGateToken(token, { ...input, signingSecret: '' }), false);
  assert.equal(await verifyPasswordGateToken(token, { ...input, signingSecret: undefined }), false);
  assert.equal(
    await verifyPasswordGateToken(token, { ...input, now: 1_000_000 + 8 * 24 * 60 * 60 * 1000 }),
    false,
  );
});

test("identity password hashes verify with the published salt/hash contract", async () => {
  const password = "merchant-selected-password";
  const { hashHex, saltHex } = await hashPassword(password);
  assert.equal(saltHex.length, 64, "new Identity credentials use a 256-bit salt");
  assert.equal(await verifyPassword(password, saltHex, hashHex), true);
  assert.equal(await verifyPassword("not-the-password", saltHex, hashHex), false);
});

test("store password portal escapes merchant content and rejects unsafe destinations", () => {
  const html = renderStorePasswordPortal({
    siteName: "<Store & Co>",
    logoUrl: "javascript:alert(1)",
    accent: "red",
    returnTo: "//evil.example",
    error: "<script>alert(1)</script>",
  });

  assert.match(html, /&lt;Store &amp; Co&gt;/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /name="return_to" value="\/"/);
  assert.match(html, /#789b7c/);
});


test("password-gate signatures require a host secret independent of database credentials", async () => {
  const { hashHex, saltHex } = await hashPassword("merchant-selected-password");
  const credentialOnly = { siteId: "site-a", passwordHash: hashHex, passwordSalt: saltHex };
  await assert.rejects(() => createPasswordGateToken(credentialOnly), /signing_secret_required/);
  await assert.rejects(() => createPasswordGateToken({
    ...credentialOnly,
    signingSecret: "too-short",
  }), /signing_secret_required/);
});
