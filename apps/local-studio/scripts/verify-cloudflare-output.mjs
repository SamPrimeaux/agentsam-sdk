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

assert.ok(fs.existsSync(configPath), "backend/wrangler.jsonc is required");
assert.ok(fs.existsSync(workerEntry), "backend/worker/index.js is required");
assert.ok(fs.existsSync(serverEntry), ".output/server/index.mjs is required; run npm run build");
assert.ok(fs.statSync(serverEntry).isFile(), "Nitro server entry must be a file");
assert.ok(fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory(), ".output/public is required");

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
assert.doesNotMatch(config, /workers\.dev/);

console.log("Local Studio Cloudflare output OK");
console.log(`  worker  ${path.relative(root, workerEntry)}`);
console.log(`  server  ${path.relative(root, serverEntry)}`);
console.log(`  assets  ${path.relative(root, assetsDir)}`);
console.log("  host    agentsam.inneranimalmedia.com");
