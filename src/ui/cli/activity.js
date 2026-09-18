import pc from 'picocolors';

const CLEAR_LINE = '\x1b[2K';
const SPINNER = ['◐', '◓', '◑', '◒'];

function elapsed(ms) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function createInlineActivity(options = {}) {
  const write = options.write || process.stdout.write.bind(process.stdout);
  const interactive = options.interactive ?? Boolean(process.stdout?.isTTY);
  const now = options.now || (() => Date.now());
  const setTimer = options.setInterval || globalThis.setInterval;
  const clearTimer = options.clearInterval || globalThis.clearInterval;
  const intervalMs = Math.max(80, Number(options.intervalMs) || 120);

  let label = String(options.label || 'Thinking');
  let startedAt = 0;
  let tick = 0;
  let timer = null;
  let active = false;

  function frame() {
    if (!active || !interactive) return;
    const icon = pc.cyan(SPINNER[tick % SPINNER.length]);
    write(`\r${CLEAR_LINE}  ${icon} ${label} ${pc.dim('· ' + elapsed(now() - startedAt))}`);
    tick += 1;
  }

  function start(nextLabel = label) {
    if (active) {
      update(nextLabel);
      return;
    }
    label = String(nextLabel || label);
    startedAt = now();
    active = true;
    if (interactive) {
      frame();
      timer = setTimer(frame, intervalMs);
    }
  }

  function update(nextLabel) {
    if (nextLabel) label = String(nextLabel);
    if (!active) start(label);
    else frame();
  }

  function finish(status = 'success', finalLabel = label) {
    if (!active) return;
    if (timer) clearTimer(timer);
    timer = null;
    const duration = elapsed(now() - startedAt);
    if (interactive) write(`\r${CLEAR_LINE}`);
    const icon = status === 'error' ? pc.red('✗') : pc.green('✓');
    write(`  ${icon} ${finalLabel} ${pc.dim('· ' + duration)}\n`);
    active = false;
  }

  return Object.freeze({
    get active() { return active; },
    start,
    update,
    succeed(labelText) { finish('success', labelText || label); },
    fail(labelText) { finish('error', labelText || 'Failed'); },
    clear() {
      if (timer) clearTimer(timer);
      timer = null;
      if (interactive && active) write(`\r${CLEAR_LINE}`);
      active = false;
    },
  });
}
