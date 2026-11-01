import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import {
  COMMANDS,
  COMMAND_IDS,
  NATIVE_MENU_EVENT,
  commandForKeyEvent,
  hasCommand,
  matchAccelerator,
  parseMenuPayload,
  registerCommandHandlers,
  resetCommandRegistryForTests,
  runCommand,
} from "./native-commands.ts";

const menuRs = readFileSync(new URL("../../../../../../packages/agentsam-desktop-shell/src-tauri/src/menu.rs", import.meta.url), "utf8");
const trayRs = readFileSync(new URL("../../../../../../packages/agentsam-desktop-shell/src-tauri/src/tray.rs", import.meta.url), "utf8");
const bridgeTsx = readFileSync(new URL("../../components/desktop/NativeCommandBridge.tsx", import.meta.url), "utf8");

beforeEach(() => resetCommandRegistryForTests());

test("menu payload contract is versioned; bare strings are rejected", () => {
  assert.equal(parseMenuPayload({ v: 1, command: "chat.new" }), "chat.new");
  assert.equal(parseMenuPayload("chat.new"), null);
  assert.equal(parseMenuPayload({ v: 2, command: "chat.new" }), null);
  assert.equal(parseMenuPayload({ v: 1 }), null);
  assert.equal(parseMenuPayload(null), null);
});

test("registry runs registered commands, rejects unknown ids, and collapses duplicate delivery", async () => {
  let runs = 0;
  const off = registerCommandHandlers({ "chat.new": () => { runs += 1; } });
  assert.equal(hasCommand("chat.new"), true);
  assert.equal(await runCommand("nope.nothing"), "unknown");
  assert.equal(await runCommand("settings.open"), "unhandled");
  assert.equal(await runCommand("chat.new", undefined, 1000), "ran");
  assert.equal(await runCommand("chat.new", undefined, 1100), "duplicate"); // menu accelerator + keydown
  assert.equal(await runCommand("chat.new", undefined, 1400), "ran");
  assert.equal(runs, 2);
  off();
  assert.equal(hasCommand("chat.new"), false);
});

test("accelerators match by physical key so Option does not break letters", () => {
  const ev = { key: "†", code: "KeyT", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };
  assert.equal(matchAccelerator(ev, "mod+alt+t"), true);
  assert.equal(commandForKeyEvent(ev), "shell.new_terminal");
  assert.equal(commandForKeyEvent({ key: "n", code: "KeyN", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), "chat.new");
  assert.equal(commandForKeyEvent({ key: "n", code: "KeyN", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }), null);
  assert.equal(commandForKeyEvent({ key: "ArrowRight", code: "ArrowRight", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }), "shell.next_tab");
});

test("accelerators are unique", () => {
  const seen = new Map<string, string>();
  for (const command of COMMANDS) {
    if (!command.accel) continue;
    assert.equal(seen.has(command.accel), false, `${command.id} duplicates ${seen.get(command.accel)}`);
    seen.set(command.accel, command.id);
  }
});

test("every product command the native menu emits is registered and wired in the bridge", () => {
  assert.equal(NATIVE_MENU_EVENT, "agentsam://native-menu");
  const rustHandled = new Set([
    "new_window", "delete_cache", "zoom_in", "zoom_out", "zoom_reset", "documentation", "shortcuts",
    "whats_new", "send_feedback", "back", "forward",
  ]);
  const ids = [...menuRs.matchAll(/(?:action|unavailable)\(\s*app,\s*"([^"]+)"/g)].map((m) => m[1]!);
  // Enabled items only: `action(...)`.
  const enabled = [...menuRs.matchAll(/action\(\s*app,\s*"([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(ids.length > enabled.length, "disabled placeholders should remain declared");
  for (const id of enabled) {
    if (rustHandled.has(id)) continue;
    assert.ok(COMMAND_IDS.has(id), `menu item ${id} has no registered command`);
    assert.ok(bridgeTsx.includes(`"${id}"`), `bridge does not handle ${id}`);
  }
  for (const id of ["app.cache_deleted", "app.cache_delete_failed"]) {
    assert.ok(menuRs.includes(`"${id}"`) && COMMAND_IDS.has(id));
  }
});

test("New Chat is a real command, never a synthetic keyboard event", () => {
  assert.ok(menuRs.includes('"chat.new", "New Chat"'));
  assert.ok(!/new KeyboardEvent\('keydown'/.test(menuRs));
  assert.ok(!/dispatchEvent\(new KeyboardEvent/.test(bridgeTsx));
});

test("tray check-update request reaches one window and the bridge answers it", () => {
  assert.ok(trayRs.includes('"agentsam://check-update-requested"'));
  // Broadcast carries the target window label; every other window's bridge drops it.
  assert.ok(/CHECK_UPDATE_EVENT,\s*CheckUpdatePayload/.test(trayRs));
  assert.ok(bridgeTsx.includes("isAddressedToThisWindow(e.payload)"));
  assert.ok(bridgeTsx.includes("CHECK_UPDATE_EVENT") && bridgeTsx.includes('runCommand("app.check_updates")'));
});

test("Studio windows hold the event capability; without it every native event is silently denied", () => {
  const cap = JSON.parse(
    readFileSync(new URL("../../../../../../packages/agentsam-desktop-shell/src-tauri/capabilities/native-events.json", import.meta.url), "utf8"),
  );
  for (const permission of ["core:event:allow-listen", "core:event:allow-unlisten", "core:event:allow-emit"]) {
    assert.ok(cap.permissions.includes(permission), permission);
  }
  for (const label of ["main", "studio-*", "agent-sam-pet"]) assert.ok(cap.windows.includes(label), label);
});
