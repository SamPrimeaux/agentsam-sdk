import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../frontend/src/lib/cad-host-bridge.ts", import.meta.url));
const artifact = await build({
  entryPoints: [entry],
  platform: "node",
  format: "esm",
  bundle: true,
  write: false,
  plugins: [
    {
      name: "stub-native-desktop-for-host-bridge-unit-test",
      setup(b) {
        b.onResolve({ filter: /desktop\/tauri$/ }, () => ({
          path: "native-host",
          namespace: "test-native",
        }));
        b.onLoad({ filter: /.*/, namespace: "test-native" }, () => ({
          contents: "export const getTauriInvoke = () => null;",
          loader: "js",
        }));
      },
    },
  ],
});
const {
  CAD_BRIDGE_CHANNEL,
  validateCadGuestMessage,
  cadSelectionToDesignEvent,
  installCadHostBridge,
} = await import(
  "data:text/javascript;base64," + Buffer.from(artifact.outputFiles[0].contents).toString("base64")
);

const selected = {
  source: "cad-creator",
  workspace: "plan",
  project_id: "project-10",
  revision: 3,
  object: { id: "wall-8", type: "wall", label: "North wall", units: "in" },
};
const frame = { contentWindow: { postMessage() {} } };
const asMessage = (selection, origin = "https://workspace.example", type = "cad.selection") => ({
  origin,
  source: frame.contentWindow,
  data: { channel: CAD_BRIDGE_CHANNEL, version: 1, type, selection },
});

test("existing CAD selection projects into the workspace contract without geometry conversion", () => {
  assert.deepEqual(cadSelectionToDesignEvent(selected), {
    type: "selection",
    resourceId: "project-10",
    selection: [{ id: "wall-8", kind: "wall" }],
  });
});

test("cross-origin and malformed selections never become workspace events", () => {
  globalThis.window = { location: { origin: "https://workspace.example" } };
  assert.equal(
    validateCadGuestMessage(asMessage(selected, "https://untrusted.example"), frame),
    null,
  );
  assert.equal(validateCadGuestMessage(asMessage({ ...selected, project_id: "" }), frame), null);
  assert.equal(
    validateCadGuestMessage(
      asMessage({ ...selected, object: { ...selected.object, type: "" } }),
      frame,
    ),
    null,
  );
  assert.ok(validateCadGuestMessage(asMessage(selected), frame));
});

test("actual iframe events emit select and deselect without writing CAD geometry", () => {
  const win = new EventTarget();
  win.location = { origin: "https://workspace.example" };
  globalThis.window = win;
  globalThis.document = { documentElement: { dataset: { theme: "dark" } } };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  const events = [];
  const dispose = installCadHostBridge(() => frame, {
    onWorkspaceEvent: (event) => events.push(event),
  });
  const dispatch = (selection, origin = win.location.origin) => {
    const message = new Event("message");
    Object.defineProperties(message, {
      source: { value: frame.contentWindow },
      origin: { value: origin },
      data: {
        value: { channel: CAD_BRIDGE_CHANNEL, version: 1, type: "cad.selection", selection },
      },
    });
    win.dispatchEvent(message);
  };
  dispatch(selected, "https://untrusted.example");
  dispatch(selected);
  dispatch(null);
  dispose();
  dispatch(selected);
  assert.deepEqual(events, [
    { type: "selection", resourceId: "project-10", selection: [{ id: "wall-8", kind: "wall" }] },
    { type: "selection", resourceId: "project-10", selection: [] },
  ]);
});
