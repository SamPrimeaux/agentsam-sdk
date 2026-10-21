import assert from "node:assert/strict";
import test from "node:test";
import { formatChromeTabShare, parseChromeTabShare } from "./chrome-share.ts";

test("parses a user-initiated Chrome tab handoff", () => {
  const raw = new URL("agentsamstudio://chrome/share");
  raw.searchParams.set("url", "https://example.com/article?q=1");
  raw.searchParams.set("title", "Example article");
  raw.searchParams.set("selection", "Selected passage\nsecond line");
  assert.deepEqual(parseChromeTabShare(raw.href), {
    url: "https://example.com/article?q=1",
    title: "Example article",
    selectedText: "Selected passage\nsecond line",
  });
  assert.match(formatChromeTabShare(parseChromeTabShare(raw.href)!), /> second line/);
  assert.match(formatChromeTabShare(parseChromeTabShare(raw.href)!), /untrusted page content/);
});

test("rejects other routes, non-web URLs, and credential-bearing URLs", () => {
  assert.equal(parseChromeTabShare("agentsamstudio://auth/callback?handoff=x"), null);
  const fileLink = new URL("agentsamstudio://chrome/share");
  fileLink.searchParams.set("url", "file:///etc/passwd");
  assert.equal(parseChromeTabShare(fileLink.href), null);
  const credentialLink = new URL("agentsamstudio://chrome/share");
  credentialLink.searchParams.set("url", "https://user:pass@example.com/");
  assert.equal(parseChromeTabShare(credentialLink.href), null);
});

test("bounds title and selected page text", () => {
  const link = new URL("agentsamstudio://chrome/share");
  link.searchParams.set("url", "https://example.com/");
  link.searchParams.set("title", "t".repeat(400));
  link.searchParams.set("selection", "s".repeat(5000));
  const share = parseChromeTabShare(link.href);
  assert.equal(share?.title.length, 300);
  assert.equal(share?.selectedText.length, 4000);
});
