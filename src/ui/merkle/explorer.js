import readline from 'node:readline';
import { renderExplorer, treeRows, renderSummary } from './render.js';

export async function runMerkleExplorer(load, { input = process.stdin, output = process.stdout, title = '', initial } = {}) {
  if (!input.isTTY || !output.isTTY || process.env.TERM === 'dumb') {
    const result = initial || await load({});
    output.write(renderSummary(result, { inspect: true }));
    return result;
  }
  const state = { result: initial, root: title, selected: 0, expanded: new Set(['']), changedOnly: false, scanning: false, progress: null };
  const color = !Object.hasOwn(process.env, 'NO_COLOR');
  let controller, pending, ending = false, lastPaint = 0;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const wasRaw = input.isRaw;
  const wasFlowing = input.readableFlowing;
  const draw = () => { if (!ending) output.write('\x1b[H\x1b[2J' + renderExplorer(state, { columns: output.columns || 80, rows: output.rows || 24, color })); };
  const close = () => { ending = true; controller?.abort(); finish(); };
  async function refresh() {
    if (pending || ending) return;
    controller = new AbortController();
    state.scanning = true; state.error = ''; state.progress = null; draw();
    pending = Promise.resolve().then(() => load({ signal: controller.signal, onProgress: (progress) => {
      state.progress = progress;
      if (Date.now() - lastPaint > 80) { lastPaint = Date.now(); draw(); }
    } })).then((result) => { state.result = result; }, (error) => {
      if (!ending) state.error = `Scan failed: ${error.message}`;
    }).finally(() => { state.scanning = false; pending = null; draw(); });
    await pending;
  }
  function keypress(text, key = {}) {
    if ((key.ctrl && key.name === 'c') || ['q', 'escape'].includes(key.name)) { close(); return; }
    if (key.name === 'r') { void refresh(); return; }
    if (key.name === 'c' && state.result?.before) { state.changedOnly = !state.changedOnly; state.selected = 0; }
    const entries = treeRows(state.result, state.expanded, state.changedOnly);
    state.selected = Math.min(state.selected, Math.max(0, entries.length - 1));
    const entry = entries[state.selected];
    if (['j', 'down'].includes(key.name)) state.selected = Math.max(0, Math.min(entries.length - 1, state.selected + 1));
    if (['k', 'up'].includes(key.name)) state.selected = Math.max(0, state.selected - 1);
    if (key.name === 'home') state.selected = 0;
    if (key.name === 'end') state.selected = Math.max(0, entries.length - 1);
    if (entry?.type === 'directory' && ['right', 'return', 'space'].includes(key.name)) {
      if (key.name !== 'right' && state.expanded.has(entry.path)) state.expanded.delete(entry.path);
      else state.expanded.add(entry.path);
    }
    if (entry && key.name === 'left') {
      if (state.expanded.has(entry.path)) state.expanded.delete(entry.path);
      else {
        const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
        state.selected = Math.max(0, entries.findIndex((row) => row.path === parent));
      }
    }
    draw();
  }
  readline.emitKeypressEvents(input);
  try {
    input.setRawMode(true); input.resume();
    input.on('keypress', keypress); input.once('end', close);
    output.on('resize', draw);
    process.once('SIGINT', close); process.once('SIGTERM', close);
    output.write('\x1b[?1049h\x1b[?25l');
    if (initial) draw(); else void refresh();
    await done;
    await pending;
    if (state.error) throw new Error(state.error);
    return state.result;
  } finally {
    ending = true; controller?.abort();
    input.removeListener('keypress', keypress); input.removeListener('end', close);
    output.removeListener('resize', draw);
    process.removeListener('SIGINT', close); process.removeListener('SIGTERM', close);
    input.setRawMode(Boolean(wasRaw));
    if (wasFlowing !== true) input.pause();
    output.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  }
}
