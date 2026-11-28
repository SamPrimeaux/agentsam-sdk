import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveMcpRuntime } from './templates/mcp-server/runtime-adapters.js';

export async function validateMcpProject(directory = '.', cwd = process.cwd()) {
  const root = path.resolve(cwd, directory);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'agentsam.mcp.json'), 'utf8'));
  if (manifest.schema_version !== 'agentsam.mcp.v1' || !manifest.name || !manifest.version) throw new Error('mcp_manifest_invalid');
  const { runtime, transport } = resolveMcpRuntime({ runtime: manifest.runtime?.kind, transport: manifest.transport?.kind });
  if (manifest.runtime?.kind !== runtime || manifest.transport?.kind !== transport) throw new Error('mcp_manifest_runtime_invalid');
  if (transport === 'stdio' ? manifest.auth?.type !== 'local' : !['oauth','public'].includes(manifest.auth?.type)) throw new Error('mcp_manifest_auth_invalid');
  if (!Array.isArray(manifest.tools) || !Array.isArray(manifest.scopes)) throw new Error('mcp_manifest_contract_invalid');
  const scopes = new Set(manifest.scopes.map(s => s.scope));
  const names = new Set();
  for (const tool of manifest.tools) {
    if (!tool.name || names.has(tool.name) || !Array.isArray(tool.required_scopes) || tool.required_scopes.some(s => !scopes.has(s))) throw new Error('mcp_manifest_tool_invalid');
    names.add(tool.name);
  }
  const entry = runtime === 'python' ? 'server.py' : runtime === 'cloudflare-worker' ? 'src/index.js' : transport === 'stdio' ? 'src/stdio.js' : 'src/http.js';
  await fs.access(path.join(root, entry));
  await fs.access(path.join(root, runtime === 'python' ? 'pyproject.toml' : 'package.json'));
  if (runtime === 'cloudflare-worker') await fs.access(path.join(root, 'wrangler.jsonc'));
  return { ok: true, root, runtime, transport, entry, manifest };
}

export async function runMcpProject(action, directory, options = {}) {
  const project = await validateMcpProject(directory, options.cwd);
  if (action === 'validate' || action === 'inspect') return project;
  const commands = project.runtime === 'python' ? {
    install: ['uv', 'sync'], test: ['uv', 'run', 'python', '-m', 'unittest', 'discover', '-s', 'tests'],
    build: ['uv', 'run', 'python', '-m', 'compileall', '-q', 'server.py'], dev: ['uv', 'run', 'python', 'server.py'],
  } : {
    install: ['npm', 'install'], test: ['npm', 'test'], dev: ['npm', 'run', 'dev'],
    build: project.runtime === 'cloudflare-worker' ? ['npm', 'exec', '--offline', '--', 'wrangler', 'deploy', '--dry-run'] : ['npm', 'run', 'check'],
    ...(project.runtime === 'cloudflare-worker' ? { deploy: ['npm', 'run', 'deploy'] } : {}),
  };
  const command = commands[action];
  if (!command) throw new Error('mcp_project_action_unsupported:' + action + ':' + project.runtime);
  const [bin, ...args] = command;
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: project.root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (exitCode !== 0) throw new Error('mcp_project_command_failed:' + action + ':' + exitCode);
  return { ...project, action, exitCode };
}


/** A user-selected development session, never a catalog-driven process spawn.
 * This executes reviewed project code with the local user's OS permissions.
 * It does not grant the account workspace authority or persist client trust.
 */
export async function runLocalMcpProject(action, directory, options = {}) {
  if (options.trustProject !== true) throw new Error('mcp_project_explicit_trust_required');
  const project = await validateMcpProject(directory, options.cwd);
  if (project.transport !== 'stdio') throw new Error('mcp_project_stdio_required');
  const root = await fs.realpath(project.root);
  const entry = await fs.realpath(path.join(root, project.entry));
  const relative = path.relative(root, entry);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('mcp_project_entry_outside_root');
  const command = project.runtime === 'python'
    ? path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    : process.execPath;
  await fs.access(command);
  const manifestTools = new Map(project.manifest.tools.map(tool => [tool.name, tool]));
  if (action === 'call' && !manifestTools.has(options.tool)) throw new Error('mcp_project_tool_not_declared');
  if (action === 'call' && options.allowWrite !== true && manifestTools.get(options.tool).annotations?.readOnlyHint !== true) throw new Error('mcp_project_write_consent_required');
  const transport = new StdioClientTransport({ command, args: [entry], cwd: root, stderr: 'pipe' });
  const client = new Client({name:'agentsam-project-client',version:'1'}, {capabilities:{}});
  // Drain stderr without leaking local process output or credential material.
  transport.stderr?.resume();
  const timer = setTimeout(() => { void transport.close().catch(()=>{}); }, 15000);
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    if (listed.nextCursor || !Array.isArray(listed.tools) || listed.tools.length > 150) throw new Error('mcp_project_tools_invalid');
    const tools = listed.tools.filter(tool => manifestTools.has(tool.name));
    if (action === 'tools') return {ok:true,transport:'stdio',name:project.manifest.name,tools};
    if (action !== 'call') throw new Error('mcp_project_action_unsupported');
    const remote = tools.find(tool=>tool.name===options.tool);
    if (!remote) throw new Error('mcp_project_tool_unavailable');
    if (options.allowWrite !== true && remote.annotations?.readOnlyHint !== true) throw new Error('mcp_project_write_consent_required');
    const input=options.input ?? {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('mcp_project_input_invalid');
    const result = await client.callTool({name:options.tool,arguments:input});
    if (result.isError) throw new Error('mcp_project_tool_failed');
    return {ok:true,transport:'stdio',name:project.manifest.name,tool:options.tool,result:result.structuredContent??result.content};
  } finally {
    clearTimeout(timer);
    await client.close().catch(()=>{});
    await transport.close().catch(()=>{});
  }
}
