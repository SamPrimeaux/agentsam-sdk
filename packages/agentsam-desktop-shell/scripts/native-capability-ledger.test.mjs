import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ledgerCommands, parseHandlers } from "./native-capability-ledger.mjs";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

test("every generate_handler! command is in the committed capability ledger", () => {
  const registered = parseHandlers(read("../src-tauri/src/main.rs")).map((h) => h.command).sort();
  const ledger = ledgerCommands(read("../docs/native-capability-ledger.md"));
  assert.ok(registered.length > 50);
  assert.deepEqual(registered.filter((c) => !ledger.includes(c)), [], "ledger is missing handlers");
  assert.deepEqual(ledger.filter((c) => !registered.includes(c)), [], "ledger lists unregistered handlers");
});

test("new native commands for the Shell/terminal sprint are registered", () => {
  const commands = parseHandlers(read("../src-tauri/src/main.rs")).map((h) => h.command);
  for (const command of ["native_color_panel_supported", "native_color_panel_open", "native_color_panel_close", "install_update"]) {
    assert.ok(commands.includes(command), command);
  }
});

test("native menu matrix documents every Shell menu command", () => {
  const menu = read("../src-tauri/src/menu.rs");
  const matrix = read("../docs/native-menu-matrix.md");
  for (const [, id] of menu.matchAll(/action\(\s*app,\s*"(shell\.[a-z_.]+)"/g)) {
    assert.ok(matrix.includes(`\`${id}\``), `matrix missing ${id}`);
  }
});
