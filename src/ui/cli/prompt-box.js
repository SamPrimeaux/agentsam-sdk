/**
 * Codex-style prompt chrome for the interactive shell:
 *   › Ask AgentSam to do anything
 *   model · ~/cwd                          ← for agents · ? for shortcuts
 * plus a live, scrollable `/` command menu (8 rows at a time) and a `?`
 * keyboard-shortcuts panel. Pure render functions + one readline installer.
 */
import { PALETTE } from '../theme.js';
import { SLASH_COMMANDS } from '../../lib/slash-commands.js';

export const MENU_ROWS = 8;
export const PLACEHOLDER = 'Ask AgentSam to do anything';
const RESET = '\x1b[0m';
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`; };
const paint = (text, code, color) => (color ? code + text + RESET : text);
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

export function matchSlash(query, commands = SLASH_COMMANDS) {
  const q = String(query || '').toLowerCase();
  if (!q.startsWith('/') || /\s/.test(q)) return [];
  const starts = commands.filter((c) => c.cmd.startsWith(q));
  const contains = commands.filter((c) => !c.cmd.startsWith(q) && (c.cmd.includes(q.slice(1)) || String(c.description).toLowerCase().includes(q.slice(1))));
  return q === '/' ? [...commands] : [...starts, ...contains];
}

/** Window of `rows` items that always contains `selected`. */
export function windowFor(total, selected, rows = MENU_ROWS, offset = 0) {
  if (total <= rows) return 0;
  let start = Math.min(offset, total - rows);
  if (selected < start) start = selected;
  if (selected >= start + rows) start = selected - rows + 1;
  return Math.max(0, Math.min(start, total - rows));
}

export function renderStatusLine({ model = 'auto', cwd = '', cols = 80, color = true } = {}) {
  const left = `  ${model}${cwd ? ` · ${cwd}` : ''}`;
  const right = '← for agents · ? for shortcuts  ';
  const gap = Math.max(2, cols - left.length - right.length);
  return paint(left, hex(PALETTE.teal300), color) + ' '.repeat(gap) + paint(right, hex(PALETTE.dim), color);
}

export function renderSlashMenu({ items, selected = 0, offset = 0, cols = 80, rows = MENU_ROWS, color = true }) {
  if (!items.length) return [paint('  No matching commands', hex(PALETTE.dim), color)];
  const start = windowFor(items.length, selected, rows, offset);
  const width = Math.max(...items.map((c) => c.cmd.length)) + 2;
  const out = items.slice(start, start + rows).map((c, i) => {
    const active = start + i === selected;
    const desc = String(c.description).slice(0, Math.max(10, cols - width - 6));
    const line = `  ${c.cmd.padEnd(width)}${desc}`;
    return active ? paint(line, `${hex(PALETTE.teal300)}\x1b[1m`, color) : paint(line, hex(PALETTE.dim), color);
  });
  if (items.length > rows) out.push(paint(`  ${selected + 1}/${items.length} · ↑↓ scroll · tab complete · esc close`, hex(PALETTE.subtle), color));
  return out;
}

export const SHORTCUT_COLUMNS = Object.freeze([
  { title: 'Compose', rows: [['/', 'slash commands'], ['!', 'run a shell command'], ['@', 'mention a file'], ['← (empty)', 'agents'], ['↑ / ↓', 'input history']] },
  { title: 'Edit', rows: [['ctrl+a / ctrl+e', 'start / end of line'], ['ctrl+u / ctrl+k', 'delete to start / end'], ['ctrl+w', 'delete previous word'], ['ctrl+l', 'clear screen']] },
  { title: 'Session', rows: [['enter', 'send'], ['esc', 'close menu / panel'], ['ctrl+c', 'cancel line · twice to exit'], ['/exit', 'leave AgentSam']] },
]);

export function renderShortcutsPanel({ color = true } = {}) {
  const lines = [paint('  Keyboard shortcuts', hex(PALETTE.teal300), color)];
  for (const col of SHORTCUT_COLUMNS) {
    lines.push('', paint(`  ${col.title}`, '\x1b[1m', color));
    for (const [key, what] of col.rows) lines.push(`    ${paint(key.padEnd(18), hex(PALETTE.teal300), color)}${paint(what, hex(PALETTE.dim), color)}`);
  }
  return lines;
}

/** Prompt string: accent chevron; the placeholder is drawn separately so it vanishes on typing. */
export function renderInputPrompt({ color = true } = {}) {
  return paint('› ', hex(PALETTE.teal300), color);
}

/**
 * Wraps rl._ttyWrite (same pattern as installPasteCollapse). Returns an uninstall fn.
 * getStatus() -> { model, cwd }.
 */
export function installPromptBox(rl, { output = process.stdout, getStatus = () => ({}), commands = SLASH_COMMANDS, color = !process.env.NO_COLOR } = {}) {
  if (!rl || rl.terminal === false || typeof rl._ttyWrite !== 'function') return { uninstall() {}, redraw() {} };
  const original = rl._ttyWrite.bind(rl);
  const state = { items: [], selected: 0, offset: 0, panel: false };
  const cols = () => output.columns || 80;
  const col = () => { try { return rl.getCursorPos().cols + 1; } catch { return 1; } };

  function below(lines) {
    let seq = '\n\r\x1b[0J';
    for (const [i, line] of lines.entries()) seq += (i ? '\n\r' : '') + line;
    const up = Math.max(1, lines.length);
    output.write(`${seq}\x1b[${up}A\x1b[${col()}G`);
  }
  function redraw() {
    const status = renderStatusLine({ ...getStatus(), cols: cols(), color });
    const typing = /^\/[^\s]+$/.test(rl.line);
    const lines = state.panel ? renderShortcutsPanel({ color })
      : state.items.length ? renderSlashMenu({ items: state.items, selected: state.selected, offset: state.offset, cols: cols(), color })
        : typing ? renderSlashMenu({ items: [], cols: cols(), color }) : [];
    below([status, ...lines]);
    if (!rl.line) {
      const text = paint(PLACEHOLDER, hex(PALETTE.subtle), color);
      output.write(`${text}\x1b[${PLACEHOLDER.length}D`);
    } else output.write('\x1b[0K');
  }
  function refreshMenu() {
    state.items = rl.line.startsWith('/') ? matchSlash(rl.line, commands) : [];
    state.selected = Math.min(state.selected, Math.max(0, state.items.length - 1));
    state.offset = windowFor(state.items.length, state.selected, MENU_ROWS, state.offset);
  }
  const closeMenu = () => { state.items = []; state.selected = 0; state.offset = 0; state.panel = false; };
  const setLine = (line) => { rl.line = line; rl.cursor = line.length; rl._refreshLine?.(); };

  rl._ttyWrite = (s, key) => {
    const name = key?.name;
    const menuOpen = state.items.length > 0 && rl.line.startsWith('/');
    if (state.panel) {
      closeMenu();
      if (name === 'escape' || s === '?') { redraw(); return undefined; }
    }
    if (menuOpen && (name === 'up' || name === 'down')) {
      const n = state.items.length;
      state.selected = (state.selected + (name === 'down' ? 1 : n - 1)) % n;
      state.offset = windowFor(n, state.selected, MENU_ROWS, state.offset);
      redraw();
      return undefined;
    }
    if (menuOpen && name === 'tab') { setLine(`${state.items[state.selected].cmd} `); closeMenu(); redraw(); return undefined; }
    if (menuOpen && name === 'escape') { closeMenu(); redraw(); return undefined; }
    if (menuOpen && (name === 'return' || name === 'enter') && !/\s/.test(rl.line)) {
      const pick = state.items[state.selected]?.cmd;
      if (pick) setLine(pick);
      closeMenu();
      output.write('\n\r\x1b[0J\x1b[1A');
      return original(s, key);
    }
    if (name === 'return' || name === 'enter') {
      closeMenu();
      output.write('\n\r\x1b[0J\x1b[1A');
      return original(s, key);
    }
    if (!rl.line && s === '?') { state.panel = true; redraw(); return undefined; }
    if (!rl.line && name === 'left') { setLine('/agent'); return original('\n', { name: 'return' }); }
    const result = original(s, key);
    refreshMenu();
    redraw();
    return result;
  };
  return { uninstall() { rl._ttyWrite = original; try { output.write('\n\r\x1b[0J\x1b[1A'); } catch { /* ignore */ } }, redraw: () => { refreshMenu(); redraw(); } };
}

export { strip as stripAnsi };
