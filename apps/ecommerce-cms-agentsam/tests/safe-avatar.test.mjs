import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { safeAvatarUrl } from "../frontend/static/js/safe-avatar.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const origin = "https://fuelnfreetime.com";

test("a hostile avatar url is omitted and a safe one becomes an img src", () => {
  const hostile = '"><img src=x onerror=alert(1)>';
  assert.equal(safeAvatarUrl(hostile, origin), "");
  assert.equal(safeAvatarUrl("javascript:alert(1)", origin), "");
  assert.equal(safeAvatarUrl("https://cdn.example/a.png", origin), "https://cdn.example/a.png");
  const document = new JSDOM("<span data-profile-avatar></span>", { url: origin + "/admin" }).window.document;
  const el = document.querySelector("[data-profile-avatar]");
  const src = safeAvatarUrl(hostile, origin);
  if (!src) el.textContent = "??";
  else {
    const img = document.createElement("img");
    img.src = src;
    el.replaceChildren(img);
  }
  assert.equal(el.querySelector("img"), null);
  const shell = readFileSync(new URL("../frontend/shell.js", import.meta.url), "utf8");
  assert.equal(shell.includes("avatar_url}" ), false);
  assert.equal(shell.includes("img.src = src"), true);
});
