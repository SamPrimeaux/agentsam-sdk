import pc from 'picocolors';

function count(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) {
    const scaled = n / 1_000_000;
    return (Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)) + 'm';
  }
  if (Math.abs(n) >= 1_000) {
    const scaled = n / 1_000;
    return (Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(Math.abs(n) >= 100_000 ? 0 : 1)) + 'k';
  }
  return String(Math.round(n));
}

function ctxLabel(usage) {
  const active = Number(usage?.current_context?.input_tokens || 0);
  const window = Number(usage?.current_context?.window_tokens || 0);
  if (!(window > 0)) return active > 0 ? `ctx ${count(active)} / unknown` : 'ctx unknown';
  return `ctx ${Math.min(999, Math.round((active / window) * 100))}%`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `$${n.toFixed(n >= 1 ? 2 : 3)}`;
}

export const FOOTER_HINTS = '/ commands · @ files · ! shell · ctrl-c to cancel';

export function renderCliFooter(value = {}) {
  const usage = value.usage || value.usageSnapshot || {};
  const cumulative = usage.cumulative || {};
  const model = String(value.model || value.modelLabel || 'model');
  const provider = String(value.provider || '').trim();
  const effort = String(value.effort || value.reasoning || '').trim();
  const tier = String(value.tier || '').trim();
  const projectName = String(value.projectName || value.identity || (value.cwd ? value.project : '') || '').trim();
  const branch = String(value.branch || value.gitBranch || '').trim();
  const cwd = String(value.cwd || (!value.projectName && !value.identity ? value.project : '') || '').trim();
  const action = String(value.action || value.statusLabel || '').trim();
  const filesEdited = Number(value.filesEdited || value.files_edited || 0);
  const elapsedMs = Number(value.elapsedMs);
  const cost = money(value.cost ?? cumulative.cost_usd ?? usage.cost_usd);

  const primary = [];
  if (projectName) primary.push(projectName);
  if (branch) primary.push(branch);
  if (cwd) primary.push(cwd.replace(String(process.env.HOME || ''), '~'));
  if (action) primary.push(action);
  primary.push([provider, model, effort].filter(Boolean).join(' ') || model);
  primary.push(ctxLabel(usage));
  primary.push(`↑${count(cumulative.input_tokens)} ↓${count(cumulative.output_tokens)}`);
  if (Number(cumulative.cached_input_tokens) > 0) primary.push(`cache ${count(cumulative.cached_input_tokens)}`);
  if (filesEdited > 0) primary.push(`${filesEdited} files edited`);
  if (cost) primary.push(cost);
  if (tier && tier !== 'default') primary.push(tier);
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    primary.push(elapsedMs < 60_000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${Math.floor(elapsedMs / 60_000)}m${Math.floor((elapsedMs % 60_000) / 1000)}s`);
  }

  const hints = String(value.hints || FOOTER_HINTS);
  return [
    pc.dim('  ' + primary.join(' · ')),
    pc.dim('  ' + hints),
  ].join('\n');
}

export function renderDiffPreview(diffText, options = {}) {
  const source = String(diffText || '');
  const color = options.color ?? !Object.hasOwn(process.env, 'NO_COLOR');
  const paint = (text, style) => {
    if (!color) return text;
    const code = style === 'add' ? '32' : style === 'del' ? '31' : style === 'hunk' ? '36' : style === 'meta' ? '1' : '2';
    return `\x1b[${code}m${text}\x1b[0m`;
  };
  if (!source.trim()) return `  ${paint('no changes', 'dim')}\n`;
  const maxLines = Math.max(20, Number(options.maxLines) || 200);
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const truncated = lines.length > maxLines;
  const shown = truncated ? lines.slice(0, maxLines) : lines;
  const out = shown.map((line) => {
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
      return `  ${paint(line, 'meta')}`;
    }
    if (line.startsWith('@@')) return `  ${paint(line, 'hunk')}`;
    if (line.startsWith('+')) return `  ${paint(line, 'add')}`;
    if (line.startsWith('-')) return `  ${paint(line, 'del')}`;
    return `  ${line}`;
  });
  if (truncated) out.push(`  ${paint(`… ${lines.length - maxLines} more lines`, 'dim')}`);
  return `${out.join('\n')}\n`;
}

export function renderUsagePanel(value = {}) {
  const session = value.session || {};
  const usage = value.usage || value.usageSnapshot || session.usage_snapshot || {};
  const cumulative = usage.cumulative || session.cumulative_usage || {};
  const current = usage.current_context || {};
  const lines = [];
  const push = (label, text) => lines.push(`  ${pc.dim(label.padEnd(12))} ${text}`);

  lines.push('');
  lines.push(`  ${pc.bold('AgentSam · Usage')}`);
  lines.push('');
  push('session', session.id || session.session_id || 'unknown');
  push('provider', value.provider || session.provider || (String(session.model_key || '').split(':')[0]) || 'unknown');
  push('model', value.model || session.model || session.model_key || 'unknown');
  push('reasoning', value.effort || session.reasoning_effort || 'unknown/unavailable');
  push('tier', value.tier || session.service_tier || 'unknown/unavailable');
  lines.push('');
  const window = Number(current.window_tokens || 0);
  const active = Number(current.input_tokens || 0);
  push(
    'context',
    window > 0
      ? `${count(active)} / ${count(window)} · ${Math.round((active / window) * 1000) / 10}%`
      : active > 0
        ? `${count(active)} / unknown`
        : 'unknown/unavailable',
  );
  push('input', count(cumulative.input_tokens));
  push('output', count(cumulative.output_tokens));
  push('cached', Number(cumulative.cached_input_tokens) > 0 ? count(cumulative.cached_input_tokens) : 'unknown/unavailable');
  lines.push('');
  push('cost', money(value.cost ?? cumulative.cost_usd ?? session.total_cost_usd) || 'unknown/unavailable');
  push('elapsed', value.elapsedLabel || (Number.isFinite(Number(value.elapsedMs)) ? `${Math.round(Number(value.elapsedMs) / 1000)}s` : 'unknown/unavailable'));
  push('tool calls', value.toolCalls != null ? String(value.toolCalls) : 'unknown/unavailable');
  push('shell', value.shellCommands != null ? String(value.shellCommands) : 'unknown/unavailable');
  push('files', value.filesEdited != null ? `${value.filesEdited} edited` : 'unknown/unavailable');
  push('compactions', value.compactions != null ? String(value.compactions) : 'unknown/unavailable');
  lines.push('');
  push('accounting', usage.estimate_kind || value.estimateKind || 'unknown/unavailable');
  if (session.id || session.session_id) {
    push('resume', `agentsam resume ${session.id || session.session_id}`);
  }
  lines.push('');
  return lines.join('\n');
}
