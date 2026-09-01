import { comparePaths } from '../../lib/merkle/hash.js';

export const safeText = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
  (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
const cellWidth = (char) => /\p{Mark}/u.test(char) ? 0 : /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3ffff}]/u.test(char) ? 2 : 1;
export function fit(value, width) {
  const chars = [...safeText(value)];
  if (chars.reduce((n, char) => n + cellWidth(char), 0) <= width) return chars.join('');
  let out = '', used = 0;
  for (const char of chars) { const size = cellWidth(char); if (used + size > width - 1) break; out += char; used += size; }
  return width > 0 ? out + '…' : '';
}
const paint = (text, code, color) => color ? `\x1b[${code}m${text}\x1b[0m` : text;

export function treeRows(result, expanded = new Set(['']), changedOnly = false) {
  if (!result?.tree) return [];
  const old = new Map((result.before?.entries || []).map((entry) => [entry.path, entry]));
  const current = new Map(result.tree.entries.map((entry) => [entry.path, entry]));
  const all = new Map([...old, ...current]);
  const children = new Map();
  for (const entry of all.values()) {
    if (entry.path === '') continue;
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(entry);
  }
  const rows = [];
  function visit(entry, depth) {
    const a = old.get(entry.path), b = current.get(entry.path);
    const status = !result.before ? '' : !a ? 'added' : !b ? 'removed' : a.type !== b.type || a.hash !== b.hash ? 'modified' : 'unchanged';
    if (changedOnly && status === 'unchanged') return;
    rows.push({ ...entry, depth, status });
    if (entry.type === 'directory' && expanded.has(entry.path)) {
      for (const child of (children.get(entry.path) || []).sort((a, b) => comparePaths(a.path, b.path))) visit(child, depth + 1);
    }
  }
  visit(all.get(''), 0);
  return rows;
}

export function renderExplorer(state, { columns = 80, rows = 24, color = false } = {}) {
  const width = Math.max(1, columns - 1);
  const height = Math.max(1, rows - 1);
  const line = (text = '') => fit(text, width);
  const result = state.result;
  const entries = treeRows(result, state.expanded, state.changedOnly);
  const index = Math.min(state.selected || 0, Math.max(0, entries.length - 1));
  const selected = entries[index];
  const stats = result?.tree.stats;
  const summary = result?.diff ? (width < 70
    ? `${result.diff.equal ? 'MATCH' : 'CHANGED'}  =${result.diff.stats.unchanged} ~${result.diff.stats.modified} +${result.diff.stats.added} -${result.diff.stats.removed}`
    : Object.entries(result.diff.stats).map(([key, n]) => `${n} ${key}`).join('  '))
    : stats ? `${stats.files} files  ${stats.symlinks} links  ${stats.bytes.toLocaleString('en-US')} bytes` : 'Reading the directory…';
  const scan = state.scanning ? `Scanning · ${state.progress?.files || 0} files · ${safeText(state.progress?.path || '')}` : (state.error || 'Ready');
  const lines = [paint(line('AGENT SAM  /  MERKLE'), '1;36', color), line(result?.title || 'Content explorer'),
    line(result?.tree.rootPath || state.root || ''), line(summary),
    paint(line(scan), state.error ? '31' : '2', color), line('─'.repeat(width))];
  const hash = selected?.hash || result?.tree.rootHash || '';
  const hashLines = hash.match(new RegExp(`.{1,${width}}`, 'g')) || [''];
  const footer = [line('─'.repeat(width)), line(selected?.path || '.'), ...hashLines,
    line('↑↓ move  Enter open  ← collapse'), line('r rescan  c changes  q quit')];
  const visibleCount = Math.max(1, height - 6 - footer.length);
  const start = Math.max(0, index - visibleCount + 1);
  for (const [offset, entry] of entries.slice(start, start + visibleCount).entries()) {
    const active = start + offset === index;
    const status = { added: '+', removed: '-', modified: '~', unchanged: ' ' }[entry.status] || ' ';
    const arrow = entry.type === 'directory' ? (state.expanded.has(entry.path) ? '▾' : '▸') : entry.type === 'symlink' ? '@' : '·';
    const name = entry.path ? entry.path.split('/').at(-1) : '.';
    const text = line(`${active ? '›' : ' '} ${status} ${'  '.repeat(Math.min(entry.depth, 12))}${arrow} ${name}${entry.type === 'directory' ? '/' : ''}`);
    const code = active ? '7' : entry.status === 'added' ? '32' : entry.status === 'removed' ? '31' : entry.status === 'modified' ? '33' : '0';
    lines.push(paint(text, code, color));
  }
  if (!entries.length) lines.push(line(state.changedOnly ? 'No changed entries.' : 'Scanning…'));
  lines.push(...footer);
  return lines.slice(0, height).join('\r\n');
}

export function renderSummary(result, { inspect = false, color = false } = {}) {
  const { tree, diff } = result;
  const lines = [paint(`Agent Sam · ${safeText(result.title)}`, '1;36', color), `  path:  ${safeText(tree.rootPath)}`,
    `  files: ${tree.stats.files}  links: ${tree.stats.symlinks}  bytes: ${tree.stats.bytes}`, `  root:  ${tree.rootHash}`];
  if (result.output) lines.push(`  saved: ${safeText(result.output)}`);
  if (diff) {
    lines.push(`  ${diff.equal ? 'MATCH' : 'CHANGED'}  ` + Object.entries(diff.stats).map(([key, value]) => `${value} ${key}`).join(' · '));
    for (const change of diff.changes) lines.push(`  ${{ added: '+', removed: '-', modified: '~' }[change.status]} ${safeText(change.path)}`);
  }
  if (inspect) for (const entry of tree.entries) lines.push(`  ${entry.type.padEnd(9)} ${entry.hash}  ${safeText(entry.path || '.')}`);
  return lines.join('\n') + '\n';
}
