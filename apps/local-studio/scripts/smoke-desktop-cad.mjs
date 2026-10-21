import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join, extname, sep, delimiter } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..", "desktop-dist");
const indexPath = join(root, "cad-creator", "index.html");
if (!existsSync(indexPath)) throw Error("cad_desktop_assets_missing: run build:desktop");
const html = readFileSync(indexPath, "utf8");
const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1]).filter((url) => url.startsWith("/cad-creator/assets/"));
if (!assetUrls.length) throw Error("cad_desktop_asset_urls_missing");
for (const url of assetUrls) {
  if (!existsSync(resolve(root, "." + url))) throw Error("cad_desktop_asset_missing:" + url);
}
const pathBrowsers = String(process.env.PATH || '').split(delimiter)
  .filter(Boolean).flatMap(dir => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .map(name => join(dir, name)));
const chrome = [
  process.env.CHROME_BIN,
  ...pathBrowsers,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean).find(existsSync);
if (!chrome) throw Error("cad_desktop_smoke_browser_missing");
const mime = new Map([
  [".html", "text/html"], [".js", "text/javascript"], [".css", "text/css"],
  [".svg", "image/svg+xml"], [".json", "application/json"], [".wasm", "application/wasm"],
]);
const missingAssets = new Set();
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  const file = resolve(root, "." + pathname);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    if (pathname.startsWith("/cad-creator/assets/")) missingAssets.add(pathname);
    res.writeHead(404).end("not found");
    return;
  }
  res.setHeader("content-type", mime.get(extname(file)) || "application/octet-stream");
  createReadStream(file).pipe(res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const baseUrl = "http://127.0.0.1:" + server.address().port;
const profile = join(process.env.TMPDIR || "/tmp", "agentsam-cad-desktop-smoke-" + process.pid);
const child = spawn(chrome, [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-sync",
  "--user-data-dir=" + profile, "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const browserStderr = [];
let browserExit = null;
child.on("exit", (code, signal) => { browserExit = { code, signal }; });
child.stderr.on("data", (data) => {
  if (browserStderr.length < 8) browserStderr.push(data.toString().slice(0, 750));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + 25000;
let ws;
try {
  const portFile = join(profile, "DevToolsActivePort");
  while (!existsSync(portFile) && !browserExit && Date.now() < deadline) await sleep(100);
  if (!existsSync(portFile)) throw Error(
    "cad_browser_debug_port_unavailable: " +
    JSON.stringify({ browserExit, stderr: browserStderr.join("").slice(-2500) })
  );
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw Error("cad_browser_page_unavailable");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    ws.addEventListener("open", done, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  const exceptions = [];
  let seq = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message); pending.delete(message.id);
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails || {};
      const error = detail.exception?.description || detail.exception?.value || detail.text;
      if (exceptions.length < 8) exceptions.push(
        String(error || "uncaught_runtime_exception") + " @" +
        String(detail.url || "unknown") + ":" + String(detail.lineNumber ?? "?")
      );
    }
  });
  const command = (method, params = {}) => new Promise((done) => {
    const id = ++seq; pending.set(id, done);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Page.navigate", { url: baseUrl + "/cad-creator/index.html?presentation=embedded" });
  let mounted = false;
  while (!mounted && Date.now() < deadline) {
    await sleep(400);
    const response = await command("Runtime.evaluate", {
      expression: 'Boolean(document.querySelector(".cad-workspace-ui")) && Boolean(document.querySelector(".cad-real-toolbar")) && Boolean(document.querySelector(".cad-workspace-stage"))',
      returnByValue: true,
    });
    if (response.result?.exceptionDetails && exceptions.length < 8) {
      exceptions.push(
        "cad_mount_probe_failed:" +
        String(response.result.exceptionDetails.exception?.description ||
          response.result.exceptionDetails.text)
      );
    }
    mounted = response.result?.result?.value === true;
  }
  if (!mounted) throw Error("cad_editor_did_not_mount:" + exceptions.join(", "));
  if (missingAssets.size) throw Error("cad_asset_requests_failed:" + [...missingAssets].join(", "));
  if (exceptions.length) throw Error("cad_runtime_exceptions:" + exceptions.join(", "));
  console.log("[desktop-cad-smoke] PASS: CAD workspace, functional authoring toolbar, viewport stage, and bundled assets mounted");
  console.log("[desktop-cad-smoke] asset references verified: " + assetUrls.length);
} finally {
  ws?.close();
  child.kill("SIGTERM");
  server.close();
}
