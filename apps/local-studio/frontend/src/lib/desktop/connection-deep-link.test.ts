import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectionReturnUrl,
  connectionReturnLocation,
  parseConnectionDeepLink,
} from "./connection-deep-link.ts";

test("a desktop connect asks the callback to return to the app, with the settings view to reopen", () => {
  const url = buildConnectionReturnUrl("cloudflare", "/settings/customize?view=plugins");
  assert.ok(url.startsWith("agentsamstudio://connection/callback?"));
  const link = parseConnectionDeepLink(url);
  assert.equal(link?.provider, "cloudflare");
  assert.equal(link?.to, "/settings/customize?view=plugins");
});

test("the server's success redirect round-trips into the same settings location the web would open", () => {
  const returned = "agentsamstudio://connection/callback?provider=cloudflare&to=%2Fsettings%2Fcustomize%3Fview%3Dplugins&connection=cloudflare&result=connected";
  const link = parseConnectionDeepLink(returned);
  assert.equal(link?.result, "connected");
  assert.equal(connectionReturnLocation(link!), "/settings/customize?view=plugins&connection=cloudflare&result=connected");
});

test("a failed connect returns the error code and stays on the settings view", () => {
  const link = parseConnectionDeepLink("agentsamstudio://connection/callback?provider=cloudflare&to=%2Fsettings%2Fcustomize&connection=cloudflare&result=error&error=oauth_state_expired");
  assert.equal(link?.result, "error");
  assert.equal(connectionReturnLocation(link!), "/settings/customize?connection=cloudflare&result=error&error=oauth_state_expired");
});

test("a link with no return target refreshes state but never navigates", () => {
  const link = parseConnectionDeepLink("agentsamstudio://connection/callback?provider=google_gmail&result=connected");
  assert.equal(link?.provider, "google_gmail");
  assert.equal(connectionReturnLocation(link!), "");
});

test("only the connection callback is accepted, and only in-app settings paths can be navigated to", () => {
  assert.equal(parseConnectionDeepLink("agentsamstudio://auth/callback?handoff=x"), null);
  assert.equal(parseConnectionDeepLink("https://evil.test/connection/callback?provider=cloudflare"), null);
  assert.equal(parseConnectionDeepLink("agentsamstudio://connection/callback?provider=Bad%20Provider"), null);
  for (const to of ["//evil.test/settings/x", "https://evil.test/settings/x", "/admin/products", "/settings/../admin", "/settings//x"]) {
    const link = parseConnectionDeepLink("agentsamstudio://connection/callback?provider=cloudflare&to=" + encodeURIComponent(to));
    assert.equal(link?.to, "", to);
  }
  assert.equal(buildConnectionReturnUrl("cloudflare", "/admin/products").includes("to="), false);
});
