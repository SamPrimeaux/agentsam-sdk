import test from "node:test";
import assert from "node:assert/strict";
import { buildNavigateDeepLink, parseNavigateDeepLink, parseOpenDeepLink } from "./open-deep-link.ts";

test("an open link yields only a valid one-time workspace handoff token", () => {
  const token = "a".repeat(64);
  assert.equal(parseOpenDeepLink(`agentsamstudio://open?handoff=${token}`), token);
  assert.equal(parseOpenDeepLink(`agentsamstudio://open/?handoff=${token}`), token);
  assert.equal(parseOpenDeepLink("agentsamstudio://open?path=%2Ftmp%2Fx"), null);
  assert.equal(parseOpenDeepLink("agentsamstudio://open?handoff=abc123"), null);
});

test("other agentsamstudio links are not open links", () => {
  assert.equal(parseOpenDeepLink("agentsamstudio://auth/callback?handoff=x"), null);
  assert.equal(parseOpenDeepLink("agentsamstudio://connection/callback?provider=cloudflare&path=%2Ftmp"), null);
  assert.equal(parseOpenDeepLink("agentsamstudio://open/extra?path=%2Ftmp"), null);
});

test("untrusted shapes are rejected before they reach native", () => {
  for (const bad of [
    "https://evil.test/open?path=%2Ftmp",
    "agentsamstudio://open",
    "agentsamstudio://open?path=",
    "agentsamstudio://open?path=relative%2Fdir",
    "agentsamstudio://open?path=..%2F..%2Fetc",
    "agentsamstudio://open?path=%2Ftmp%00x",
    "agentsamstudio://open?path=" + encodeURIComponent("/" + "a".repeat(5000)),
    "not a url",
  ]) assert.equal(parseOpenDeepLink(bad), null, bad.slice(0, 60));
});


test("desktop navigation links preserve the current same-app route", () => {
  const link = buildNavigateDeepLink("/admin/agentsam?conversation=chat_123#composer");
  assert.equal(link, "agentsamstudio://navigate?to=%2Fadmin%2Fagentsam%3Fconversation%3Dchat_123%23composer");
  assert.equal(parseNavigateDeepLink(link!), "/admin/agentsam?conversation=chat_123#composer");
});

test("desktop navigation links reject external and malformed destinations", () => {
  for (const path of ["https://evil.test", "//evil.test/path", "\\evil.test\\path", "", "/" + "a".repeat(5000)]) {
    assert.equal(buildNavigateDeepLink(path), null, path.slice(0, 60));
  }
  for (const link of [
    "https://evil.test/navigate?to=%2Fadmin%2Fagentsam",
    "agentsamstudio://open?to=%2Fadmin%2Fagentsam",
    "agentsamstudio://navigate?to=https%3A%2F%2Fevil.test",
    "agentsamstudio://navigate?to=%2F%2Fevil.test",
    "agentsamstudio://navigate/extra?to=%2Fadmin%2Fagentsam",
  ]) assert.equal(parseNavigateDeepLink(link), null, link);
});
