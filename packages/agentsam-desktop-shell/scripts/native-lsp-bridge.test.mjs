import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(import.meta.dirname, "../../..");
const script = resolve(import.meta.dirname, "native-lsp-bridge.mjs");
const host = join(repo, "packages/agentsam-ide/src/lsp/host.mjs");

test("bundled native LSP bridge loads real host and refuses unknown language/actions", () => {
  const dir = mkdtempSync(join(tmpdir(), "agentsam-lsp-package-"));
  try {
    copyFileSync(script, join(dir, "native-lsp-bridge.mjs"));
    copyFileSync(host, join(dir, "host.mjs"));
    const requests = [
      { action: "capabilities", workspace_root: dir },
      { action: "start", workspace_root: dir, language: "unknown-lsp-binary" },
      { action: "arbitrary_shell", workspace_root: dir, command: "echo hidden" },
      { action: "send", session_id: "not-a-session", message: { jsonrpc: "2.0" } },
    ];
    const child = spawnSync(process.execPath, [join(dir, "native-lsp-bridge.mjs")], {
      input: requests.map((req) => JSON.stringify(req)).join("\n") + "\n",
      encoding: "utf8",
      timeout: 7_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const output = child.stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(output.length, 4);
    assert.equal(output[0].ok, true);
    assert.ok(output[0].capabilities.typescript);
    assert.ok(output[0].capabilities.rust);
    assert.equal(output[1].error, "lsp_unsupported_language");
    assert.equal(output[2].error, "lsp_action_not_supported");
    assert.equal(output[3].error, "lsp_unknown_session");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tauri bundle carries both LSP native entrypoint and IDE runtime", () => {
  const config = JSON.parse(readFileSync(join(repo, "packages/agentsam-desktop-shell/src-tauri/tauri.conf.json"), "utf8"));
  const entries = Object.values(config.bundle.resources);
  assert.ok(entries.includes("runtime/lsp/native-lsp-bridge.mjs"));
  assert.ok(entries.includes("runtime/lsp/host.mjs"));
});


test("brand generator keeps LSP assets through regeneration", () => {
  const generator = readFileSync(join(repo, "packages/agentsam-desktop-shell/scripts/build-brand.mjs"), "utf8");
  assert.match(generator, /runtime\/lsp\/native-lsp-bridge\.mjs/);
  assert.match(generator, /runtime\/lsp\/host\.mjs/);
});
