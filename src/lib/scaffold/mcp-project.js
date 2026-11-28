import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
