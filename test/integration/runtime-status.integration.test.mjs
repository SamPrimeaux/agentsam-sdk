import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  collectCloudflareDeploymentStatus,
  readCloudflareDeploymentContract,
  parseWranglerToml,
  resolveProjectD1Database,
} from '../../src/cloudflare/runtime-status.js';
import { collectRuntimeStatus } from '../../src/commands/runtime-status.js';
import { readProjectConfig } from '../../src/lib/project-config.js';
import { runStatus } from '../../src/commands/status.js';
import { renderRuntimeStatus } from '../../src/ui/ansi.js';

const root = path.resolve(new URL('../..', import.meta.url).pathname);

test('checked-in Cloudflare deployment contract resolves the real Worker and portable bindings', () => {
  const contract = readCloudflareDeploymentContract(root, readProjectConfig(root));
  assert.equal(contract.worker_name, 'agentsam-sdk');
  assert.equal(contract.config, 'apps/local-studio/backend/wrangler.jsonc');
  assert.deepEqual(contract.bindings.map((row) => row.name), [
    'AGENTSAM_WAI', 'ASSETS', 'DB', 'EXECOS', 'HYPERDRIVE', 'IAM_CLIENT_ID',
    'IAM_OAUTH_ISSUER', 'PTY_SERVICE', 'WEBSITE_ASSETS',
  ]);
});

test('Cloudflare runtime status compares the active deployed version to the checked-in binding contract', async () => {
  const projectConfig = readProjectConfig(root);
  const contract = readCloudflareDeploymentContract(root, projectConfig);
  const liveBindings = contract.bindings.map((row) => ({ name: row.name, type: row.type }));
  liveBindings.push({ name: 'OPENAI_API_KEY', type: 'secret_text' });
  const calls = [];
  const result = await collectCloudflareDeploymentStatus({
    root,
    projectConfig,
    runWrangler: async (command, input) => {
      calls.push({ command, input });
      if (command === 'whoami') return { data: { loggedIn: true } };
      if (command === 'deployments.list') return { data: [{ id: 'dep_1', created_on: '2026-09-18T12:00:00Z', versions: [{ version_id: 'ver_1', percentage: 100 }] }] };
      if (command === 'versions.list') return { data: [{ id: 'ver_1', metadata: { created_on: '2026-09-18T12:00:00Z' } }] };
      if (command === 'versions.view') return { data: { id: 'ver_1', number: 37, metadata: { created_on: '2026-09-18T12:00:00Z', source: 'wrangler' }, resources: { bindings: liveBindings } } };
      throw new Error(`unexpected:${command}`);
    },
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { ok: true, app: 'agentsam-sdk' }; } }),
  });
  assert.equal(result.connected, true);
  assert.equal(result.bindings.match, true);
  assert.equal(result.version.number, 37);
  assert.equal(result.health.ok, true);
  assert.equal(calls.find((row) => row.command === 'versions.view').input.version_id, 'ver_1');
});

test('unified status is ready only when account, model, terminal, deployment and health are real', async () => {
  const local = {
    root, project: 'agentsam-sdk', configured: true, git: { branch: 'main', revision: 'abc123', dirty: false },
    pty: { online: false, url: 'http://127.0.0.1:3099/health' }, api: { online: false }, db: { ready: true, tables: [] },
  };
  const status = await collectRuntimeStatus({
    cwd: root,
    collectLocal: async () => local,
    collectIdentity: async () => ({ authenticated: true, active_auth: { kind: 'browser_oauth' }, identity: { account_id: 'acct_1' }, api_key: {} }),
    collectModels: async () => ({ providers: [{ id: 'openai', configured: true }], providerModels: { openai: [{ provider_model_id: 'gpt-test' }] }, local: { online: false, models: [] } }),
    collectTerminal: async () => ({ connected: true, instances: [{ id: 'inst_1' }], connections: [{ id: 'conn_1', active: true, default: true, health: 'online' }], error: null }),
    collectCloudflare: async () => ({ configured: true, connected: true, worker_name: 'agentsam-sdk', bindings: { match: true, live: [] }, health: { ok: true, status: 200 } }),
  });
  assert.equal(status.ready, true);
  assert.equal(status.local_ready, true);
  assert.equal(status.state_storage.actor_runtime, 'none');
  assert.deepEqual(status.checks, { account: true, models: true, terminal: true, cloudflare: true });
  assert.equal(status.model_summary.verified_provider_models, 1);
});

test('fresh local project can start before SQLite has been initialized', async () => {
  const status = await collectRuntimeStatus({
    cwd: root,
    collectLocal: async () => ({ root, project: 'agentsam-sdk', configured: false, git: null, pty: { online: false }, api: {}, db: { exists: false, ready: false } }),
    collectIdentity: async () => ({ authenticated: false, active_auth: {}, api_key: {} }),
    collectModels: async () => ({ providers: [], providerModels: {}, local: { online: false, models: [] } }),
    collectCloudflare: async () => ({ configured: false, bindings: { live: [] } }),
  });
  assert.equal(status.local_ready, true);
  assert.equal(status.state_storage.migrated, false);
  assert.equal(status.state_storage.runtime, 'sqlite');
});

test('unified status consumes the CLI-authorized terminal inventory returned by IAM context', async () => {
  let legacyTerminalCalls = 0;
  const status = await collectRuntimeStatus({
    cwd: root,
    collectLocal: async () => ({ root, project: 'agentsam-sdk', configured: true, git: null, pty: { online: false }, api: {}, db: {} }),
    collectIdentity: async () => ({
      authenticated: true,
      active_auth: { kind: 'browser_oauth' },
      api_key: {},
      terminal: {
        available: true,
        instances: [{ id: 'inst_1', kind: 'local_device' }],
        connections: [{ id: 'conn_1', instance_id: 'inst_1', is_active: true, is_default: true, health_status: 'online' }],
      },
    }),
    collectModels: async () => ({ providers: [], providerModels: { openai: [{ provider_model_id: 'gpt-test' }] }, local: { online: false, models: [] } }),
    collectTerminal: async () => { legacyTerminalCalls += 1; return { connected: false, instances: [], connections: [] }; },
    collectCloudflare: async () => ({ configured: false }),
  });
  assert.equal(legacyTerminalCalls, 0);
  assert.equal(status.terminal.active_connection_count, 1);
  assert.equal(status.checks.terminal, true);
});

test('status command supports machine-readable injected runtime status', async () => {
  const expected = { schema_version: 'agentsam-runtime-status-v1', ready: true };
  let output = '';
  const result = await runStatus(['--json'], { collectRuntime: async () => expected, write(value) { output += value; } });
  assert.equal(result, expected);
  assert.deepEqual(JSON.parse(output), expected);
});

test('renderRuntimeStatus explicitly displays DB and other resource bindings', () => {
  const status = {
    local: { project: 'agentsam-sdk', root: '/path/to/project' },
    ready: true,
    local_ready: true,
    checks: { account: true, models: true, terminal: true, cloudflare: true },
    cloudflare: {
      configured: true,
      worker_name: 'agentsam-sdk',
      version: { number: 43 },
      bindings: {
        match: true,
        live: [
          { name: 'DB', type: 'd1', database_name: 'inneranimalmedia-business' },
          { name: 'WEBSITE_ASSETS', type: 'r2_bucket', bucket_name: 'agentsam-os-blueprint-content' },
          { name: 'AGENTSAM_WAI', type: 'ai' },
          { name: 'IAM_CLIENT_ID', type: 'plain_text' },
          { name: 'OPENAI_API_KEY', type: 'secret_text' },
        ],
        declared: [
          { name: 'DB', type: 'd1', database_name: 'inneranimalmedia-business' },
          { name: 'WEBSITE_ASSETS', type: 'r2_bucket', bucket_name: 'agentsam-os-blueprint-content' },
          { name: 'AGENTSAM_WAI', type: 'ai' },
        ],
        resources: [
          { name: 'DB', type: 'd1', database_name: 'inneranimalmedia-business' },
          { name: 'WEBSITE_ASSETS', type: 'r2_bucket', bucket_name: 'agentsam-os-blueprint-content' },
          { name: 'AGENTSAM_WAI', type: 'ai' },
        ],
        runtime_variables: [{ name: 'IAM_CLIENT_ID', type: 'plain_text' }],
        runtime_secrets: [{ name: 'OPENAI_API_KEY', type: 'secret_text' }],
        missing: [],
      },
      health: { ok: true, status: 200 },
    },
  };

  const rendered = renderRuntimeStatus(status);
  assert.match(rendered, /bindings\s+.*5 live/);
  assert.match(rendered, /• DB · d1 \(inneranimalmedia-business\)/);
  assert.match(rendered, /• WEBSITE_ASSETS · r2 \(agentsam-os-blueprint-content\)/);
  assert.match(rendered, /• AGENTSAM_WAI · ai/);
  assert.match(rendered, /1 vars · 1 secrets/);
});

test('parseWranglerToml parses worker name, d1 databases, r2, hyperdrive, and vars', () => {
  const sample = `
name = "my-sample-worker"
main = "src/index.js"

[vars]
ENVIRONMENT = "production"
PORT = 8080

[[d1_databases]]
binding = "DB"
database_name = "sample-production-db"
database_id = "d1-uuid-123"

[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "sample-bucket"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "hd-uuid-456"

[ai]
binding = "AI"
`;

  const parsed = parseWranglerToml(sample);
  assert.equal(parsed.name, 'my-sample-worker');
  assert.equal(parsed.vars.ENVIRONMENT, 'production');
  assert.equal(parsed.vars.PORT, 8080);
  assert.equal(parsed.d1_databases.length, 1);
  assert.equal(parsed.d1_databases[0].binding, 'DB');
  assert.equal(parsed.d1_databases[0].database_name, 'sample-production-db');
  assert.equal(parsed.r2_buckets.length, 1);
  assert.equal(parsed.r2_buckets[0].binding, 'UPLOADS');
  assert.equal(parsed.hyperdrive.length, 1);
  assert.equal(parsed.hyperdrive[0].binding, 'HYPERDRIVE');
  assert.equal(parsed.ai.binding, 'AI');
});

test('resolveProjectD1Database discovers project DB binding from checked-in config', () => {
  const resolved = resolveProjectD1Database(root);
  assert.equal(resolved, 'inneranimalmedia-business');
});
