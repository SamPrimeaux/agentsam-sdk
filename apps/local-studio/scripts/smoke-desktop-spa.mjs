import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..", "desktop-dist");
const indexPath = join(root, "index.html");
if (!existsSync(indexPath)) {
  console.error("[desktop-smoke] desktop-dist missing; run build:desktop first");
  process.exit(2);
}

const assetsDir = join(root, "assets");
const cssText = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(join(assetsDir, name), "utf8"))
  .join("\n");
const requiredUtilitySelectors = [
  ".w-72",
  ".max-h-80",
  ".max-w-36",
  ".min-w-44",
  ".bg-popover",
  ".text-popover-foreground",
  ".text-xs",
  ".z-50",
];
const missingUtilitySelectors = requiredUtilitySelectors.filter((selector) => !cssText.includes(selector));
if (missingUtilitySelectors.length) {
  console.error(
    "[desktop-smoke] packaged CSS is missing workbench utilities:",
    missingUtilitySelectors.join(", "),
  );
  process.exit(2);
}

function browserCandidates() {
  const candidates = [process.env.CHROME_BIN].filter(Boolean);
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else if (process.platform === "win32") {
    for (const base of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(
        join(base, "Google", "Chrome", "Application", "chrome.exe"),
        join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
    }
  } else {
    for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
      const found = spawnSync("which", [name], { encoding: "utf8" });
      if (found.status === 0 && found.stdout.trim()) candidates.push(found.stdout.trim());
    }
  }
  return [...new Set(candidates)].find((candidate) => candidate && existsSync(candidate));
}

const browser = browserCandidates();
if (!browser) {
  console.error("[desktop-smoke] Chrome/Chromium/Edge unavailable; set CHROME_BIN");
  process.exit(3);
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".json", "application/json"],
]);

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = resolve(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.setHeader("content-type", mime.get(extname(file)) ?? "application/octet-stream");
  createReadStream(file).pipe(res);
});

await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const address = server.address();
if (!address || typeof address === "string") throw new Error("desktop_smoke_server_failed");
const url = `http://127.0.0.1:${address.port}/#/agentsam`;
const profile = join(process.env.TMPDIR || "/tmp", `agentsam-desktop-smoke-${process.pid}`);

const args = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  `--user-data-dir=${profile}`,
  "--enable-logging=stderr",
  "--v=0",
  "--virtual-time-budget=5000",
  "--dump-dom",
  url,
];

const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill("SIGTERM"), 15000);
await new Promise((resolveExit) => child.once("exit", resolveExit));
clearTimeout(timeout);
server.close();

const consoleErrors = stderr
  .split(/\r?\n/)
  .filter((line) => /CONSOLE:|Uncaught|ReferenceError|TypeError|SyntaxError|ERR_/i.test(line));

const rootStart = stdout.indexOf('id="root"');
const scriptStart = rootStart >= 0 ? stdout.indexOf("<script", rootStart) : -1;
const rootHtml = rootStart >= 0
  ? stdout.slice(rootStart, scriptStart > rootStart ? scriptStart : rootStart + 12000)
  : "";

const failures = [];
if (rootStart < 0 || /id="root"><\/div>/.test(rootHtml)) failures.push("desktop_root_empty");
if (/Something went wrong/.test(rootHtml)) failures.push("desktop_error_boundary");
if (/Local Studio could not start\./.test(rootHtml)) failures.push("desktop_boot_failed");
if (!/data-agentsam-app-shell="local-studio"/.test(rootHtml)) failures.push("desktop_shell_missing");
if (!/What should we work on\?/.test(rootHtml)) failures.push("desktop_workspace_missing");
if (consoleErrors.length) failures.push("desktop_console_error");

if (failures.length) {
  console.error("[desktop-smoke] FAIL", failures.join(", "));
  if (consoleErrors.length) console.error(consoleErrors.join("\n"));
  console.error(rootHtml.slice(0, 4000));
  process.exit(4);
}

console.log(`[desktop-smoke] PASS browser=${browser}`);
console.log("[desktop-smoke] shell mounted: local-studio / What should we work on?");
