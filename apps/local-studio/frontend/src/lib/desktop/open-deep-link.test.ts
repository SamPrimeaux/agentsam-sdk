import test from "node:test";
import assert from "node:assert/strict";
import { parseOpenDeepLink } from "./open-deep-link.ts";

test("an open link yields the absolute path, decoded", () => {
  assert.equal(parseOpenDeepLink("agentsamstudio://open?path=%2FUsers%2Fsam%2Fmy%20repo%20%26%20co&t=abc"), "/Users/sam/my repo & co");
  assert.equal(parseOpenDeepLink("agentsamstudio://open/?path=%2Ftmp%2Fx"), "/tmp/x");
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
