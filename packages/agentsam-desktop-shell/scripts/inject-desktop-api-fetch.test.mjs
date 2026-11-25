import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { injectDesktopApiFetch } from "./inject-desktop-api-fetch.mjs";

test("injects the desktop API bootstrap before host and embedded app modules", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentsam-desktop-api-"));
  try {
    mkdirSync(path.join(root, "cad-creator"), { recursive: true });
    writeFileSync(path.join(root, "desktop-api-fetch.js"), "/* bootstrap */");
    writeFileSync(path.join(root, "index.html"), '<html><head></head><body><script type="module" src="/main.js"></script></body></html>');
    writeFileSync(path.join(root, "cad-creator/index.html"), '<html><head></head><body><script type="module" src="/cad.js"></script></body></html>');

    assert.equal(injectDesktopApiFetch(root), 2);
    const host = readFileSync(path.join(root, "index.html"), "utf8");
    const app = readFileSync(path.join(root, "cad-creator/index.html"), "utf8");
    assert.ok(host.indexOf('<script src="/desktop-api-fetch.js"></script>') < host.indexOf('type="module"'));
    assert.ok(app.indexOf('<script src="/desktop-api-fetch.js"></script>') < app.indexOf('type="module"'));
    assert.equal(injectDesktopApiFetch(root), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to inject when the bootstrap asset is missing", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agentsam-desktop-api-missing-"));
  try {
    writeFileSync(path.join(root, "index.html"), "<html><head></head></html>");
    assert.throws(() => injectDesktopApiFetch(root), /desktop_api_fetch_bootstrap_missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
