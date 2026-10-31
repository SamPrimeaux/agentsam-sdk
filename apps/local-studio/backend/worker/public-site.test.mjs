import test from "node:test";
import assert from "node:assert/strict";
import { isPublicSitePath, publicSitePathForRequest } from "./public-site.js";

test("dedicated Theme Store host serves the gallery at its root", () => {
  const request = new Request("https://themes.inneranimalmedia.com/");
  const pathname = publicSitePathForRequest(request);
  assert.equal(pathname, "/themes");
  assert.equal(isPublicSitePath(pathname), true);
});

test("dedicated Theme Store host maps /index.html to the gallery", () => {
  const request = new Request("https://themes.inneranimalmedia.com/index.html");
  assert.equal(publicSitePathForRequest(request), "/themes");
});

test("shared AgentSam homepage remains the homepage", () => {
  const request = new Request("https://agentsam.inneranimalmedia.com/");
  const pathname = publicSitePathForRequest(request);
  assert.equal(pathname, "/");
  assert.equal(isPublicSitePath(pathname), true);
});

test("theme deep links retain their existing path", () => {
  const request = new Request("https://themes.inneranimalmedia.com/themes/resolve/demo/");
  assert.equal(publicSitePathForRequest(request), "/themes/resolve/demo/");
});
