import {
  text,
  select,
  confirm,
  note,
  isCancel,
  cancel,
} from '@clack/prompts';
import pc from 'picocolors';
import { createMcpServerProject } from '../mcp-server.js';
import { listMcpServerPresets } from '../templates/mcp-server/presets.js';

export async function runMcpServerWizard() {
  const presets = listMcpServerPresets();
  const preset = await select({
    message: 'MCP server preset?',
    options: presets.map((item) => ({
      value: item.key,
      label: item.display_name,
      hint: item.description || 'Portable MCP Worker',
    })),
  });
  if (isCancel(preset)) { cancel('Cancelled.'); process.exit(0); }

  const projectName = await text({
    message: 'Project name?',
    placeholder: 'my-mcp-server',
    validate(value) {
      if (!String(value || '').trim()) return 'Required.';
      if (!/^[a-z0-9-]+$/.test(String(value).trim())) {
        return 'Lowercase letters, numbers, and hyphens only.';
      }
    },
  });
  if (isCancel(projectName)) { cancel('Cancelled.'); process.exit(0); }

  const confirmed = await confirm({
    message: `Generate ./${String(projectName).trim()}?`,
  });
  if (isCancel(confirmed) || !confirmed) {
    cancel('Cancelled.');
    process.exit(0);
  }

  const result = await createMcpServerProject({
    projectName: String(projectName).trim(),
    preset,
  });

  note([
    `Generated ${result.file_count} files`,
    `Manifest: ${result.manifest_path}`,
    `Transport: ${result.transport} ${result.endpoint_path}`,
    '',
    `cd ${String(projectName).trim()}`,
    'npm install',
    'npm run dev',
  ].join('\n'), pc.green('MCP server ready'));

  return result;
}
