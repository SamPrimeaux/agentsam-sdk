import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const configPath = path.join(backend, "wrangler.jsonc");
const workerEntry = path.join(backend, "worker", "index.js");
const serverEntry = path.join(root, ".output", "server", "index.mjs");
const assetsDir = path.join(root, ".output", "public");
const siteHome = path.join(assetsDir, "site", "home", "index.html");
const siteHomepage = path.join(assetsDir, "site", "homepage.html");
const localStudioWorkPage = path.join(root, "frontend", "src", "components", "work", "LocalStudioWorkPage.tsx");

assert.ok(fs.existsSync(configPath), "backend/wrangler.jsonc is required");
assert.ok(fs.existsSync(workerEntry), "backend/worker/index.js is required");
assert.ok(fs.existsSync(serverEntry), ".output/server/index.mjs is required; run npm run build");
assert.ok(fs.statSync(serverEntry).isFile(), "Nitro server entry must be a file");
assert.ok(fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory(), ".output/public is required");
assert.ok(fs.existsSync(localStudioWorkPage), "LocalStudioWorkPage.tsx is required");
const localStudioWorkSource = fs.readFileSync(localStudioWorkPage, "utf8");
assert.doesNotMatch(
  localStudioWorkSource,
  /presentation\s*=\s*["']embedded["']/,
  "Local Studio must retain the standalone Work product shell; embedded mode is for hosts that already own full workspace chrome",
);
assert.ok(fs.existsSync(siteHome) && fs.statSync(siteHome).size > 20000, ".output/public/site/home/index.html is required (>20KB)");
assert.ok(fs.existsSync(siteHomepage) && fs.statSync(siteHomepage).size > 20000, ".output/public/site/homepage.html is required (>20KB)");
assert.ok(fs.existsSync(path.join(assetsDir, "site", "packages", "sdk", "help", "index.html")), "SDK help page asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "site", "learn", "index.html")), "Learn hub asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "site", "global", "installables.json")), "installables.json asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "brand", "agentsam-mark-on-dark.svg")), "hosted AgentSam dark mark asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "brand", "agentsam-mark-on-light.svg")), "hosted AgentSam light mark asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "brand", "agentsam-local-studio-icon.png")), "hosted AgentSam app icon asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "favicon.svg")), "hosted AgentSam favicon asset required");
assert.ok(fs.existsSync(path.join(assetsDir, "__agentsam", "pwa", "icon-180.png")), "hosted AgentSam apple-touch icon required");
assert.ok(fs.existsSync(path.join(assetsDir, "__agentsam", "pwa", "icon-192.png")), "hosted AgentSam PWA 192 icon required");
assert.ok(fs.existsSync(path.join(assetsDir, "__agentsam", "pwa", "icon-512.png")), "hosted AgentSam PWA 512 icon required");
assert.match(fs.readFileSync(workerEntry, "utf8"), /public-site\.js/);

const desktopManifestPath = path.resolve(
  root,
  "../../packages/agentsam-desktop-shell/manifests/local-studio.json",
);
let includedApps = [];
if (fs.existsSync(desktopManifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(desktopManifestPath, "utf8"));
    includedApps = Array.isArray(manifest.included_apps) ? manifest.included_apps : [];
  } catch {
    includedApps = [];
  }
}

if (includedApps.includes("cad-creator")) {
  const cadHtml = path.join(assetsDir, "cad-creator", "index.html");
  assert.ok(fs.existsSync(cadHtml), "CAD frontend index must be staged into Worker assets");
  for (const match of fs.readFileSync(cadHtml, "utf8").matchAll(/(?:src|href)="(\/cad-creator\/assets\/[^\"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(assetsDir, match[1])), `CAD asset missing: ${match[1]}`);
  }
} else {
  console.log("CAD assets not required (included_apps omits cad-creator)");
}


const config = fs.readFileSync(configPath, "utf8");
const worker = fs.readFileSync(workerEntry, "utf8");
assert.match(config, /"name"\s*:\s*"agentsam-sdk"/);
assert.match(config, /"main"\s*:\s*"worker\/index\.js"/);
assert.match(config, /"directory"\s*:\s*"\.\.\/\.output\/public"/);
assert.match(config, /"workers_dev"\s*:\s*false/);
assert.match(config, /"pattern"\s*:\s*"agentsam\.inneranimalmedia\.com"/);
assert.match(config, /"binding"\s*:\s*"EXECOS"/);
assert.match(config, /"service"\s*:\s*"execos"/);
assert.match(config, /"binding"\s*:\s*"PTY_SERVICE"/);
assert.match(config, /"service_id"\s*:\s*"019db639-7c70-7071-8ef3-32ec0392a9ff"/);
assert.match(worker, /from ["']\.\.\/\.\.\/\.output\/server\/index\.mjs["']/);
assert.match(worker, /url\.pathname\.startsWith\(["']\/api\/vault\/["']\)/);
assert.match(worker, /return nitroWorker\.fetch\(request, env, context\)/);
assert.doesNotMatch(config, /AGENTSAM_WORKER_ROLE/);
assert.doesNotMatch(config, /"OLLAMA_BASE_URL"\s*:/);
// A verified third-party plugin catalog can live on workers.dev; the AgentSam\n// Worker deployment routes themselves must still use the canonical custom domain.\nconst deploymentRoutes = config.match(/"routes"\\s*:\\s*\\[[\\s\\S]*?\\]/)?.[0] || "";\nassert.doesNotMatch(deploymentRoutes, /workers\\.dev/);

console.log("Local Studio Cloudflare output OK");
console.log(`  worker  ${path.relative(root, workerEntry)}`);
console.log(`  server  ${path.relative(root, serverEntry)}`);
console.log(`  assets  ${path.relative(root, assetsDir)}`);
console.log("  host    agentsam.inneranimalmedia.com");
