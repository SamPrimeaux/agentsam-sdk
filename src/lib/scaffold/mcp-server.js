import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileTree } from './writer.js';
import {
  mcpServerTemplates,
  resolveMcpServerTemplateConfig,
} from './templates/mcp-server/index.js';

async function directoryHasEntries(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function createMcpServerProject(input = {}, options = {}) {
  const config = resolveMcpServerTemplateConfig(input);
  const cwd = path.resolve(options.cwd || process.cwd());
  const outputDir = path.resolve(cwd, input.outputDir || input.output || config.projectName);
  const force = Boolean(input.force || options.force);

  if (!force && await directoryHasEntries(outputDir)) {
    throw new Error(`mcp_output_not_empty:${outputDir}`);
  }

  const files = mcpServerTemplates(config);
  const manifest = JSON.parse(files['agentsam.mcp.json']);
  await writeFileTree(outputDir, files);

  return Object.freeze({
    ok: true,
    preset: config.preset,
    project_name: config.projectName,
    display_name: config.displayName,
    output_dir: outputDir,
    file_count: Object.keys(files).length,
    tool_count: manifest.tools.length,
    tool_names: manifest.tools.map((tool) => tool.name),
    auth_mode: config.authMode,
    install_command: config.runtime === 'python' ? 'uv sync' : 'npm install',
    test_command: config.runtime === 'python' ? 'uv run python -m unittest discover -s tests' : 'npm test',
    dev_command: config.runtime === 'python' ? 'uv run python server.py' : 'npm run dev',
    manifest_path: path.join(outputDir, 'agentsam.mcp.json'),
    runtime: config.runtime,
    transport: config.transport,
    endpoint_path: config.transport === 'stdio' ? null : '/mcp',
  });
}
