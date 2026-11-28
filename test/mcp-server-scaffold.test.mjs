import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpServerProject } from '../src/lib/scaffold/mcp-server.js';
import { runMcp } from '../src/commands/mcp.js';
import { mcpServerTemplates, resolveMcpServerTemplateConfig } from '../src/lib/scaffold/templates/mcp-server/index.js';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function createFixture(options = {}) {
  const directory = await fs.mkdtemp(path.join(repoRoot, '.mcp-server-scaffold-test-'));
  await createMcpServerProject({ projectName: 'scaffold-acceptance', outputDir: directory, ...options }, { cwd: repoRoot });
  const workerModule = await import(pathToFileURL(path.join(directory, 'src/index.js')).href + '?fixture=' + Date.now() + Math.random());
  return { directory, worker: workerModule.default, manifest: workerModule.manifest };
}

async function removeFixture(directory) {
  await fs.rm(directory, { recursive: true, force: true });
}

async function withMcpClient(worker, env, run, token = 'scaffold-test-token') {
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.example.test/mcp'), {
    requestInit: { headers: { authorization: 'Bearer ' + token } },
    fetch: (url, init) => worker.fetch(new Request(url, init), env),
  });
  const client = new Client({ name: 'agentsam-sdk-scaffold-acceptance', version: '1.0.0' });
  await client.connect(transport);
  try { return await run(client); } finally { await client.close(); }
}

test('MCP scaffold emits a complete runnable project instead of a manifest-only placeholder', () => {
  const config = resolveMcpServerTemplateConfig({ projectName: 'Example MCP' });
  assert.equal(config.projectName, 'example-mcp');
  assert.equal(config.issuer, '');
  assert.equal(config.audience, '');
  assert.equal(config.homepageUrl, '');
  const files = mcpServerTemplates({ projectName: 'example-mcp' });
  const required = [
    'package.json', 'agentsam.mcp.json', 'wrangler.jsonc', '.gitignore', '.dev.vars.example',
    'src/index.js', 'src/oauth.js', 'src/tools/index.js', 'test/oauth.test.js', 'test/transport.test.js', 'README.md',
  ];
  for (const file of required) assert.ok(files[file], 'missing generated file: ' + file);
  assert.equal(Object.keys(files).some((file) => file.startsWith('migrations/')), false);

  const manifest = JSON.parse(files['agentsam.mcp.json']);
  assert.equal(manifest.schema_version, 'agentsam.mcp.v1');
  assert.equal(manifest.tools.length, 4);
  assert.ok(manifest.tools.every((tool) => tool.required_scopes.includes('mcp:read')));
  assert.equal(manifest.scopes[0].required, true);
  assert.equal(manifest.auth.issuer, '');
  assert.equal(manifest.resource.audience, '');
  assert.equal(JSON.stringify(files).includes('example.com'), false);

  const wrangler = JSON.parse(files['wrangler.jsonc']);
  assert.equal(wrangler.compatibility_date, '2026-11-10');
  assert.equal(wrangler.vars.MCP_AUTH_ISSUER, '');
  assert.equal(wrangler.vars.MCP_RESOURCE_AUDIENCE, '');

  const packageJson = JSON.parse(files['package.json']);
  assert.equal(packageJson.scripts.test, 'node --test');
  assert.equal(packageJson.dependencies['@modelcontextprotocol/sdk'], '1.32.1');
  assert.equal(packageJson.dependencies.zod, '4.6.7');
  assert.equal(packageJson.devDependencies.wrangler, '4.157.0');
});

test('MCP scaffold validates auth configuration and scope declarations', () => {
  assert.throws(() => resolveMcpServerTemplateConfig({ projectName: 'invalid', authMode: 'none' }), /mcp_auth_mode_invalid/);
  assert.throws(() => resolveMcpServerTemplateConfig({ projectName: 'invalid', audience: 'not-a-url' }), /mcp_audience_must_be_absolute_url/);
  assert.throws(() => resolveMcpServerTemplateConfig({ projectName: 'invalid', issuer: 'not-a-url' }), /mcp_issuer_must_be_absolute_url/);
  assert.throws(() => resolveMcpServerTemplateConfig({ projectName: 'invalid', scopes: [{ scope: 'mcp:read' }, { scope: 'mcp:read' }] }), /mcp_scope_duplicate/);
  const configured = resolveMcpServerTemplateConfig({ projectName: 'configured', issuer: 'https://identity.example.test', audience: 'https://mcp.example.test/mcp' });
  assert.equal(configured.issuer, 'https://identity.example.test');
  assert.equal(configured.audience, 'https://mcp.example.test/mcp');
});

test('generated Worker completes a real Streamable HTTP handshake and executes tools', async () => {
  const fixture = await createFixture();
  try {
    const health = await fixture.worker.fetch(new Request('https://mcp.example.test/health'), {
      MCP_AUTH_MODE: 'oauth',
      MCP_AUTH_ISSUER: 'https://issuer.example.test',
      MCP_RESOURCE_AUDIENCE: 'https://mcp.example.test/mcp',
      MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect',
    });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).tool_count, 4);

    await withMcpClient(fixture.worker, { MCP_AUTH_MODE: 'public' }, async (client) => {
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
        'math.calculate', 'system.health', 'system.info', 'text.transform',
      ]);

      const transformed = await client.callTool({
        name: 'text.transform',
        arguments: { text: '  Inner Animal Media  ', operation: 'slugify' },
      });
      assert.equal(transformed.structuredContent.result, 'inner-animal-media');

      const calculated = await client.callTool({
        name: 'math.calculate',
        arguments: { left: 7, operation: 'multiply', right: 6 },
      });
      assert.equal(calculated.structuredContent.result, 42);
    });
  } finally {
    await removeFixture(fixture.directory);
  }
});

test('generated Worker enforces OAuth audience and tool-level scopes', async () => {
  const fixture = await createFixture({ issuer: 'https://issuer.example.test', audience: 'https://mcp.example.test/mcp' });
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      active: true,
      aud: 'https://mcp.example.test/mcp',
      scope: 'profile',
      sub: 'user-without-mcp-read',
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    await withMcpClient(fixture.worker, {
      MCP_AUTH_MODE: 'oauth',
      MCP_AUTH_ISSUER: 'https://issuer.example.test',
      MCP_TOKEN_VERIFY_URL: 'https://issuer.example.test/introspect',
      MCP_RESOURCE_AUDIENCE: 'https://mcp.example.test/mcp',
    }, async (client) => {
      const denied = await client.callTool({
        name: 'math.calculate',
        arguments: { left: 2, operation: 'add', right: 3 },
      });
      assert.equal(denied.isError, true);
      assert.equal(denied.structuredContent.error, 'insufficient_scope');
      assert.deepEqual(denied.structuredContent.missing_scopes, ['mcp:read']);
    });
  } finally {
    globalThis.fetch = previousFetch;
    await removeFixture(fixture.directory);
  }
});


test('agentsam mcp create uses the same runnable factory and reports its real tools', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsam-mcp-cli-'));
  const outputDir = path.join(parent, 'generated-server');
  const output = [];
  try {
    const result = await runMcp(['create', 'generated-server', '--output', outputDir, '--json'], {
      cwd: parent,
      write: (value) => output.push(value),
    });
    assert.equal(result.ok, true);
    assert.equal(result.tool_count, 4);
    assert.equal(result.auth_mode, 'oauth');
    assert.equal(result.file_count, 11);
    const generatedManifest = JSON.parse(await fs.readFile(path.join(outputDir, 'agentsam.mcp.json'), 'utf8'));
    assert.equal(generatedManifest.auth.issuer, '');
    assert.equal(generatedManifest.resource.audience, '');
    assert.deepEqual(result.tool_names, ['system.health', 'system.info', 'text.transform', 'math.calculate']);
    assert.equal(JSON.parse(output.join('')).tool_count, 4);
    assert.ok(await fs.stat(path.join(outputDir, 'src/tools/index.js')));
  } finally {
    await removeFixture(parent);
  }
});
