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
  await writeFileTree(outputDir, files);

  return Object.freeze({
    ok: true,
    preset: config.preset,
    project_name: config.projectName,
    display_name: config.displayName,
    output_dir: outputDir,
    file_count: Object.keys(files).length,
    manifest_path: path.join(outputDir, 'agentsam.mcp.json'),
    transport: 'streamable_http',
    endpoint_path: '/mcp',
  });
}
