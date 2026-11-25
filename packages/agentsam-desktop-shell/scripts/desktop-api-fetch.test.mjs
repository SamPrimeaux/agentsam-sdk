import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const bootstrap = await readFile(
  new URL("../../../apps/local-studio/frontend/public/desktop-api-fetch.js", import.meta.url),
  "utf8",
);

function makeWindow({ invoke, exposeTauri = true, exposeOnTop = false } = {}) {
  const calls = [];
  const originalCalls = [];
  const win = {
    location: new URL("http://tauri.localhost/"),
    fetch: async (input, init) => {
      originalCalls.push({ input, init });
      return new Response("original-fetch", { status: 200 });
    },
    Request,
    Response,
    Headers,
    URL,
    Uint8Array,
    ArrayBuffer,
    DOMException,
    btoa,
    atob,
    top: null,
  };
  win.top = win;
  const nativeInvoke = invoke || (async (command, args) => {
    calls.push({ command, args });
    return JSON.stringify({
      ok: true,
      status: 200,
      content_type: "application/json",
      body: '{"ok":true}',
      headers: [["etag", '"desktop-test"'], ["content-length", "11"]],
    });
  });
  if (exposeTauri) win.__TAURI__ = { core: { invoke: nativeInvoke } };
  if (exposeOnTop) {
    win.__TAURI__ = undefined;
    win.top = { __TAURI__: { core: { invoke: nativeInvoke } } };
  }
  vm.runInNewContext(bootstrap, {
    window: win,
    Request,
    Response,
    Headers,
    URL,
    Uint8Array,
    ArrayBuffer,
    DOMException,
    Promise,
    Set,
    JSON,
    Number,
    TypeError,
    String,
    Math,
  });
  return { win, calls, originalCalls };
}

test("desktop fetch forwards same-origin API requests through the authenticated service transport", async () => {
  const { win, calls } = makeWindow();
  const response = await win.fetch("/api/work/canvases?limit=10");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("etag"), '"desktop-test"');
  assert.equal(response.headers.get("content-length"), "11");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "studio_service_bridge");
  const request = JSON.parse(calls[0].args.requestJson);
  assert.deepEqual(request, {
    operation: "api",
    path: "/api/work/canvases?limit=10",
    method: "GET",
  });
});

test("desktop fetch preserves request bodies and binary response bytes", async () => {
  const expected = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const { win, calls } = makeWindow({
    invoke: async (command, args) => {
      calls.push({ command, args });
      return JSON.stringify({
        ok: true,
        status: 200,
        content_type: "application/octet-stream",
        body: "",
        body_base64: Buffer.from(expected).toString("base64"),
      });
    },
  });
  const requestBody = JSON.stringify({ title: "Canvas" });
  const response = await win.fetch("/api/work/canvases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
  });
  const request = JSON.parse(calls[0].args.requestJson);
  assert.equal(request.operation, "api");
  assert.equal(request.method, "POST");
  assert.equal(request.content_type, "application/json");
  assert.equal(Buffer.from(request.body_base64, "base64").toString("utf8"), requestBody);
  assert.deepEqual(
    Array.from(new Uint8Array(await response.arrayBuffer())),
    Array.from(expected),
  );
});

test("desktop fetch leaves static and cross-origin requests untouched but forwards credential-omitted APIs anonymously", async () => {
  const { win, calls, originalCalls } = makeWindow();
  await win.fetch("/cad-creator/assets/scene.glb");
  await win.fetch("https://cdn.inneranimalmedia.com/image.webp");
  await win.fetch("/api/public-data", { credentials: "omit" });
  assert.equal(calls.length, 1);
  assert.equal(originalCalls.length, 2);
  const request = JSON.parse(calls[0].args.requestJson);
  assert.deepEqual(request, {
    operation: "api",
    path: "/api/public-data",
    method: "GET",
    skip_auth: true,
  });
});

test("desktop fetch forwards conditional and workspace capability headers without caller identity overrides", async () => {
  const { win, calls } = makeWindow();
  await win.fetch("/api/work/canvases/cv_123", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "If-Match": '"rev-7"',
      "X-AgentSam-Workspace-Capability": "cap_scoped_123",
      Authorization: "Bearer caller-token",
      "X-User-Id": "forged-account",
      "X-AgentSam-Native-Client": "forged",
    },
    body: JSON.stringify({ document: {} }),
  });
  const request = JSON.parse(calls[0].args.requestJson);
  assert.equal(request.content_type, "application/json");
  assert.deepEqual(request.headers, [
    ["if-match", '"rev-7"'],
    ["x-agentsam-workspace-capability", "cap_scoped_123"],
  ]);
});

test("embedded app frames can reuse the top-level Tauri transport", async () => {
  const { win, calls } = makeWindow({ exposeTauri: false, exposeOnTop: true });
  const response = await win.fetch("/api/admin/store/online");
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});


const desktopPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("desktop development and installable builds share the complete asset pipeline", () => {
  const scripts = desktopPackage.scripts;
  assert.match(scripts.dev, /build:desktop-assets/);
  assert.match(scripts["build:desktop-assets"], /build:included:all/);
  assert.match(scripts["build:desktop-assets"], /inject-desktop-api-fetch\.mjs/);
  assert.match(scripts.bundle, /build:desktop-assets/);
  assert.match(scripts["bundle:app"], /build:desktop-assets/);
});

test("web builds without Tauri keep the normal browser fetch", async () => {
  const { win, calls, originalCalls } = makeWindow({ exposeTauri: false });
  const response = await win.fetch("/api/admin/store/online");
  assert.equal(await response.text(), "original-fetch");
  assert.equal(calls.length, 0);
  assert.equal(originalCalls.length, 1);
});
