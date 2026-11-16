import test from "node:test";
import assert from "node:assert/strict";
import { handleBrowserPage, isBlockedBrowserHost, normalizeBrowserTarget, rewriteHtml } from "./browser-page.js";

const req = (target) => new Request("https://studio.example.com/api/browser/page?url=" + encodeURIComponent(target));

test("blocks private, loopback and internal hosts", () => {
  for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.4", "172.20.1.1", "169.254.169.254", "[::1]", "2130706433", "intranet", "printer.local"])
    assert.equal(isBlockedBrowserHost(host), true, host);
  for (const host of ["example.com", "8.8.8.8", "sub.example.co.uk"]) assert.equal(isBlockedBrowserHost(host), false, host);
});

test("normalizes targets and rejects credentials, odd ports and own host", () => {
  assert.equal(normalizeBrowserTarget("example.com/a#x").href, "https://example.com/a");
  assert.throws(() => normalizeBrowserTarget("https://u:p@example.com"), /browser_url_invalid/);
  assert.throws(() => normalizeBrowserTarget("https://example.com:8443"), /browser_url_blocked/);
  assert.throws(() => normalizeBrowserTarget("javascript:alert(1)"), /browser_url_invalid/);
  assert.throws(() => normalizeBrowserTarget("https://studio.example.com", "studio.example.com"), /browser_url_blocked/);
});

test("requires a session", async () => {
  assert.equal((await handleBrowserPage(req("https://example.com"), null)).status, 401);
});

test("serves sandboxed html with base + bridge and strips frame headers", async () => {
  const fetchImpl = async () => new Response("<html><head><meta http-equiv='Content-Security-Policy' content='x'></head><body>hi</body></html>",
    { status: 200, headers: { "content-type": "text/html", "x-frame-options": "DENY", "set-cookie": "a=b" } });
  const res = await handleBrowserPage(req("https://example.com/p"), "au_1", { fetchImpl });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /<base href="https:\/\/example\.com\/p">/);
  assert.match(body, /agentsam-browser/);
  assert.doesNotMatch(body, /http-equiv='Content-Security-Policy'/i);
  assert.equal(res.headers.get("x-frame-options"), null);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.match(res.headers.get("content-security-policy"), /^sandbox allow-scripts/);
});

test("re-validates redirect hops", async () => {
  const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
  assert.equal((await handleBrowserPage(req("https://example.com"), "au_1", { fetchImpl })).status, 403);
});

test("rewriteHtml handles documents without a head", () => {
  assert.match(rewriteHtml("<p>x</p>", "https://a.test/"), /<base href="https:\/\/a\.test\/">/);
});
