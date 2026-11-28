// Runtime and transport are separate from the shared MCP tool contract.
export const MCP_RUNTIME_TARGETS = Object.freeze([
  Object.freeze({ runtime: 'cloudflare-worker', transport: 'streamable_http', label: 'Cloudflare Workers · HTTP' }),
  Object.freeze({ runtime: 'node', transport: 'stdio', label: 'Node.js · local stdio' }),
  Object.freeze({ runtime: 'node', transport: 'streamable_http', label: 'Node.js · HTTP' }),
  Object.freeze({ runtime: 'python', transport: 'stdio', label: 'Python · local stdio (AgentSam Python SDK)' }),
]);

export function resolveMcpRuntime(input = {}) {
  const requested = String(input.runtime || 'cloudflare-worker').toLowerCase();
  const runtime = ({ cloudflare: 'cloudflare-worker', nodejs: 'node' })[requested] || requested;
  const transport = String(input.transport || (['node', 'python'].includes(runtime) ? 'stdio' : 'streamable_http')).toLowerCase().replace(/-/g, '_');
  if (!MCP_RUNTIME_TARGETS.some(t => t.runtime === runtime && t.transport === transport)) {
    throw new Error('mcp_runtime_transport_unsupported:' + runtime + ':' + transport);
  }
  return { runtime, transport };
}

function stdioSource() {
  return `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, manifest } from './index.js';

const server = createServer({ kind: 'local', subject: 'local-process', scopes: manifest.scopes.map(s => s.scope) });
await server.connect(new StdioServerTransport());
`;
}

function httpSource() {
  return `import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker, { manifest } from './index.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
if ((process.env.MCP_AUTH_MODE || manifest.auth.type) === 'public' && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
  throw new Error('Public MCP testing must bind to loopback');
}
const server = createServer(async (req, res) => {
  try {
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) { res.writeHead(400); res.end(); return; }
    const base = 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + port;
    const init = { method: req.method, headers: req.headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req);
      init.duplex = 'half';
    }
    const response = await worker.fetch(new Request(new URL(req.url, base), init), process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body), res);
    else res.end();
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(port, host, () => console.error('MCP HTTP listening on ' + host + ':' + server.address().port));
`;
}

function stdioTestSource() {
  return `import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real stdio process supports tool discovery and execution', async () => {
  const client = new Client({ name: 'acceptance', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/stdio.js', import.meta.url))] });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.some(t => t.name === 'math.calculate'));
    const result = await client.callTool({ name: 'math.calculate', arguments: { left: 2, right: 3, operation: 'add' } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.result, 5);
  } finally { await client.close(); }
});
`;
}

function pythonAdapter(config, files) {
  return {
    'agentsam.mcp.json': files['agentsam.mcp.json'],
    'pyproject.toml': [
      '[project]', 'name = ' + JSON.stringify(config.projectName), 'version = ' + JSON.stringify(config.version),
      'requires-python = ">=3.10"', 'dependencies = ["agentsam-sdk[mcp]>=0.3.1,<0.4"]',
      '', '[tool.uv]', 'package = false', '',
    ].join('\n'),
    '.gitignore': '.venv/\n__pycache__/\n.env\n*.pyc\n',
    'server.py': `from pathlib import Path
from agentsam_sdk.mcp import create_stdio_server, load_manifest

manifest = load_manifest(Path(__file__).with_name("agentsam.mcp.json"))

# Extend the server using register=callback. The SDK exposes the official
# MCP server API, and opt-in read adapters for explicitly scoped SDK clients.
server = create_stdio_server(manifest)
if __name__ == "__main__":
    server.run(transport="stdio")
`,
    'tests/test_server.py': `import asyncio
from pathlib import Path
import sys
import unittest
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


class ServerTest(unittest.TestCase):
    def test_stdio(self):
        async def check():
            path = Path(__file__).resolve().parents[1] / "server.py"
            async with stdio_client(StdioServerParameters(command=sys.executable, args=[str(path)])) as (reader, writer):
                async with ClientSession(reader, writer) as client:
                    await client.initialize()
                    listed = await client.list_tools()
                    assert {tool.name for tool in listed.tools} == {"system.health", "system.info", "text.transform", "math.calculate"}
                    result = await client.call_tool("math.calculate", {"left": 2, "right": 3, "operation": "add"})
                    assert not result.is_error, result
                    assert result.structured_content["result"] == 5
        asyncio.run(check())


if __name__ == "__main__":
    unittest.main()
`,
    'README.md': '# ' + config.displayName + '\n\nPython stdio MCP using the AgentSam Python SDK.\n\n' +
      'Requires Python 3.10+ and agentsam-sdk[mcp] 0.3.1 or newer. Run `uv sync`, `uv run python -m unittest discover -s tests`, then configure the client to launch the project virtualenv Python with the absolute path to server.py.\n' +
      'The SDK owns the MCP runtime. Register project-specific tools, resources and prompts in server.py. Filesystem access is disabled by default; opt-in workspace reads require an explicitly scoped SDK client and a trusted per-call authorization callback. No cloud account or Node runtime is needed.\n',
  };
}

export function applyRuntimeAdapter(config, files) {
  if (config.runtime === 'python') return pythonAdapter(config, files);
  if (config.runtime === 'cloudflare-worker') return files;
  const { 'wrangler.jsonc': wrangler, '.dev.vars.example': devVars, ...nodeFiles } = files;
  const pkg = JSON.parse(nodeFiles['package.json']);
  delete pkg.devDependencies;
  delete pkg.scripts.deploy;
  pkg.engines = { node: '>=20' };
  const stdio = config.transport === 'stdio';
  const entry = stdio ? 'src/stdio.js' : 'src/http.js';
  pkg.scripts.dev = 'node ' + entry;
  pkg.scripts.start = pkg.scripts.dev;
  pkg.scripts.check = 'node --check ' + entry + ' && node --check src/index.js && node --check src/tools/index.js && npm test';
  nodeFiles[entry] = stdio ? stdioSource() : httpSource();
  if (stdio) {
    delete nodeFiles['test/oauth.test.js'];
    delete nodeFiles['test/transport.test.js'];
    nodeFiles['test/stdio.test.js'] = stdioTestSource();
  }
  nodeFiles['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
  nodeFiles['README.md'] = [
    '# ' + config.displayName, '', 'Runtime: Node.js 20+ · ' + config.transport, '',
    'Install with npm install; verify with npm run check; start with npm run dev.',
    stdio ? 'Configure your MCP client to launch node with the absolute path to src/stdio.js. The parent process controls access. stdout is reserved for MCP protocol messages.' :
      'Defaults to loopback. Configure MCP_AUTH_ISSUER, MCP_RESOURCE_AUDIENCE and MCP_TOKEN_VERIFY_URL in the environment before remote use. Set HOST and PORT explicitly for deployment. Public mode is for loopback testing only.',
    '', 'Shared tools are defined in src/tools/index.js and declared in agentsam.mcp.json.',
    'No Cloudflare account or Wrangler installation is required.', '',
  ].join('\n');
  return nodeFiles;
}
