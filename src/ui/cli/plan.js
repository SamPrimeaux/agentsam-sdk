import pc from 'picocolors';

export function renderPlanUpdate(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.todos) ? payload.todos : [];
  if (!items.length) return '';
  const lines = ['', '  ' + pc.bold(payload.title || 'Plan')];
  for (const item of items.slice(0, 20)) {
    const status = String(item.status || 'open');
    const icon = status === 'complete' || status === 'completed' || status === 'done'
      ? pc.green('✓')
      : status === 'running' || status === 'active'
        ? pc.cyan('●')
        : status === 'blocked'
          ? pc.yellow('◆')
          : pc.dim('○');
    lines.push(`    ${icon} ${item.title || item.label || item.id || 'task'}`);
  }
  lines.push('');
  return lines.join('\n');
}
