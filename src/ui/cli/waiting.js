import pc from 'picocolors';

export function renderWaitingInput(payload = {}) {
  const reason = String(payload.reason || payload.awaiting_input_reason || 'input required');
  const url = String(payload.url || payload.auth_url || '').trim();
  const code = String(payload.code || payload.user_code || '').trim();
  const lines = [
    '',
    `  ${pc.yellow('◇')} ${pc.bold('Waiting for you')} ${pc.dim('· ' + reason)}`,
  ];
  if (url) lines.push(`    Open  ${pc.cyan(url)}`);
  if (code) lines.push(`    Code  ${pc.bold(code)}`);
  lines.push(`    ${pc.dim(payload.message || 'Complete the requested step; Agent Sam will continue when the runtime is ready.')}`);
  lines.push('');
  return lines.join('\n');
}
