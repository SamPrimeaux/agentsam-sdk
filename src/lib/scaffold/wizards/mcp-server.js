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

function validateOptionalUrl(value, label) {
  const candidate = String(value || '').trim();
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return `${label} must be an absolute HTTP(S) URL.`;
    }
  } catch {
    return `${label} must be an absolute HTTP(S) URL.`;
  }
  return undefined;
}

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

  const issuer = await text({
    message: 'OAuth issuer URL? (leave blank to configure later)',
    placeholder: 'https://identity.example.com',
    validate(value) { return validateOptionalUrl(value, 'OAuth issuer'); },
  });
  if (isCancel(issuer)) { cancel('Cancelled.'); process.exit(0); }

  const audience = await text({
    message: 'MCP resource audience URL? (leave blank to configure later)',
    placeholder: 'https://mcp.example.com/mcp',
    validate(value) { return validateOptionalUrl(value, 'MCP resource audience'); },
  });
  if (isCancel(audience)) { cancel('Cancelled.'); process.exit(0); }

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
    issuer: String(issuer || '').trim(),
    audience: String(audience || '').trim(),
  });

  note([
    `Generated ${result.file_count} files`,
    `Manifest: ${result.manifest_path}`,
    `Transport: ${result.transport} ${result.endpoint_path}`,
    `Tools: ${result.tool_count} executable tools`,
    `Auth: ${result.auth_mode} (fail-closed unless explicitly public)`,
    `OAuth issuer: ${String(issuer || '').trim() || 'configure before deployment'}`,
    `Resource audience: ${String(audience || '').trim() || 'configure before deployment'}`,
    '',
    `cd ${String(projectName).trim()}`,
    'npm install',
    'npm test',
    'npm run dev',
  ].join('\n'), pc.green('MCP server ready'));

  return result;
}
