import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const exists = (relative) => fs.existsSync(new URL(`../${relative}`, import.meta.url));

const wrangler = read('apps/local-studio/backend/wrangler.jsonc');
const providers = read('apps/local-studio/shared/agentsam/src/model-providers.ts');
const runtime = read('apps/local-studio/backend/server/lib/cloudflare-runtime.ts');
const worker = read('apps/local-studio/backend/worker/index.js');

test('Local Studio backend is the only agentsam-sdk Cloudflare application owner', () => {
  assert.equal(exists('wrangler.jsonc'), false);
  assert.equal(exists('worker/index.js'), false);
  assert.equal(exists('scripts/with-cloudflare-env.sh'), false);
  assert.ok(exists('apps/local-studio/backend/worker/index.js'));
  assert.equal(exists('apps/local-studio/backend/wrangler.ui.toml'), false);
  assert.equal(exists('apps/local-studio/backend/wrangler.workmode.toml'), false);
  assert.ok(exists('apps/local-studio/backend/wrangler.jsonc'));
});

test('agentsam-sdk Worker uses the backend Worker entry, custom domain only, and canonical bindings', () => {
  assert.match(wrangler, /"name"\s*:\s*"agentsam-sdk"/);
  assert.match(wrangler, /"main"\s*:\s*"worker\/index\.js"/);
  assert.match(wrangler, /"directory"\s*:\s*"\.\.\/\.output\/public"/);
  assert.match(wrangler, /"workers_dev"\s*:\s*false/);
  assert.match(wrangler, /"pattern"\s*:\s*"agentsam\.inneranimalmedia\.com"/);
  assert.match(wrangler, /"binding"\s*:\s*"DB"/);
  assert.match(wrangler, /"database_name"\s*:\s*"inneranimalmedia-business"/);
  assert.match(wrangler, /"binding"\s*:\s*"WEBSITE_ASSETS"/);
  assert.match(wrangler, /"bucket_name"\s*:\s*"agentsam-os-blueprint-content"/);
  assert.match(wrangler, /"binding"\s*:\s*"AGENTSAM_WAI"/);
  assert.match(wrangler, /"binding"\s*:\s*"EXECOS"/);
  assert.match(wrangler, /"service"\s*:\s*"execos"/);
  assert.match(wrangler, /"binding"\s*:\s*"PTY_SERVICE"/);
  assert.match(wrangler, /"service_id"\s*:\s*"019db639-7c70-7071-8ef3-32ec0392a9ff"/);
  assert.match(wrangler, /"IAM_ORIGIN"\s*:\s*"https:\/\/inneranimalmedia\.com"/);
  assert.doesNotMatch(wrangler, /AGENTSAM_WORKER_ROLE/);
  assert.doesNotMatch(wrangler, /"OLLAMA_BASE_URL"\s*:/);
  assert.doesNotMatch(wrangler, /workers\.dev/);
});

test('canonical Worker preserves vault routes and delegates app traffic to Nitro', () => {
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/vault\/"\)/);
  assert.match(worker, /\/api\/vault\/secrets/);
  assert.match(worker, /\/api\/vault\/unwrap/);
  assert.match(worker, /return nitroWorker\.fetch\(request, env, context\)/);
});

test('model providers include Grok independently from Grok gate authentication', () => {
  for (const id of ['grok', 'openai', 'gemini', 'workers-ai', 'ollama']) {
    assert.match(providers, new RegExp(`id: ["']${id}["']`));
  }
  assert.match(providers, /credential: "XAI_API_KEY"/);
  assert.match(providers, /binding: "AGENTSAM_WAI"/);
  assert.match(providers, /binding: "EXECOS"/);
});

test('Ollama uses local loopback behind ExecOS with an explicit cwd resolved from PTY health', () => {
  assert.match(runtime, /baseUrl: "http:\/\/127\.0\.0\.1:11434"/);
  assert.match(runtime, /target: "local"/);
  assert.match(runtime, /x-bridge-key/);
  assert.match(runtime, /data\.default_cwd \|\| data\.workspaces_root/);
  assert.match(runtime, /JSON\.stringify\(\{ command, target: "local", cwd \}\)/);
  assert.match(runtime, /public_base_url: false/);
  assert.doesNotMatch(runtime, /ollama\.inneranimalmedia\.com/);
});
