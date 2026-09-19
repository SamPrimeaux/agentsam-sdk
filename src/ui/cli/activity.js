import pc from 'picocolors';

const CLEAR_LINE = '\x1b[2K';
const SPINNER = ['◐', '◓', '◑', '◒'];

function elapsed(ms) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function count(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function createInlineActivity(options = {}) {
  const write = options.write || process.stdout.write.bind(process.stdout);
  const interactive = options.interactive ?? Boolean(process.stdout?.isTTY);
  const now = options.now || (() => Date.now());
  const setTimer = options.setInterval || globalThis.setInterval;
  const clearTimer = options.clearInterval || globalThis.clearInterval;
  const intervalMs = Math.max(80, Number(options.intervalMs) || 120);
  const interruptible = options.interruptible !== false;

  let label = String(options.label || 'Running');
  let startedAt = 0;
  let tick = 0;
  let timer = null;
  let active = false;
  let tokenTotal = Number(options.tokenTotal) || 0;

  function frame() {
    if (!active || !interactive) return;
    const icon = pc.cyan(SPINNER[tick % SPINNER.length]);
    const parts = [elapsed(now() - startedAt)];
    const tokens = count(tokenTotal);
    if (tokens) parts.unshift(`${tokens} tokens`);
    if (interruptible) parts.push('esc to interrupt');
    write(`\r${CLEAR_LINE}  ${icon} ${label} ${pc.dim('· ' + parts.join(' · '))}`);
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

  function update(nextLabel, nextTokens) {
    if (nextLabel) label = String(nextLabel);
    if (Number.isFinite(Number(nextTokens))) tokenTotal = Number(nextTokens);
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
    const tokens = count(tokenTotal);
    write(`  ${icon} ${finalLabel} ${pc.dim('· ' + [tokens ? `${tokens} tokens` : null, duration].filter(Boolean).join(' · '))}\n`);
    active = false;
  }

  return Object.freeze({
    get active() { return active; },
    start,
    update,
    setTokens(value) { update(null, value); },
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
