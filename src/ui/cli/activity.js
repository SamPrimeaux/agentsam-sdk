import pc from 'picocolors';

const CLEAR_LINE = '\x1b[2K';
const SPINNER = ['◐', '◓', '◑', '◒'];
export const INTERRUPT_HINT = 'ctrl-c to cancel';

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

export function colorAllowed(env = process.env) {
  if (!env || Object.hasOwn(env, 'NO_COLOR')) return false;
  if (String(env.FORCE_COLOR || '') === '0') return false;
  return true;
}

export function colorDepth(env = process.env) {
  if (!colorAllowed(env)) return 0;
  const colorterm = String(env.COLORTERM || '').toLowerCase();
  if (colorterm.includes('truecolor') || colorterm.includes('24bit')) return 24;
  if (String(env.TERM || '').includes('direct')) return 24;
  return 8;
}

export function renderShimmer(text, tick = 0, options = {}) {
  const env = options.env || process.env;
  const source = String(text ?? '');
  if (!source) return '';
  const depth = colorDepth(env);
  if (depth === 0) return source;
  const chars = [...source];
  const highlight = Math.max(3, Math.min(6, chars.length));
  const origin = ((Number(tick) || 0) % (chars.length + highlight)) - highlight;
  const painted = chars.map((ch, index) => {
    const dist = index - origin;
    const t = dist < 0 || dist > highlight ? 0 : 1 - Math.abs((dist / highlight) - 0.5) * 2;
    if (depth >= 24) {
      const r = Math.round(34 + t * 180);
      const g = Math.round(180 + t * 75);
      const b = Math.round(220 + t * 35);
      return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[39m`;
    }
    const code = t > 0.6 ? 159 : t > 0.2 ? 87 : 37;
    return `\x1b[38;5;${code}m${ch}\x1b[39m`;
  }).join('');
  return `${painted}\x1b[0m`;
}

export function createInlineActivity(options = {}) {
  const write = options.write || process.stdout.write.bind(process.stdout);
  const interactive = options.interactive ?? Boolean(process.stdout?.isTTY);
  const now = options.now || (() => Date.now());
  const setTimer = options.setInterval || globalThis.setInterval;
  const clearTimer = options.clearInterval || globalThis.clearInterval;
  const intervalMs = Math.max(80, Number(options.intervalMs) || 120);
  const interruptible = options.interruptible !== false;
  const env = options.env || process.env;

  let label = String(options.label || 'Running');
  let startedAt = 0;
  let tick = 0;
  let timer = null;
  let active = false;
  let tokenTotal = Number(options.tokenTotal) || 0;

  function paint(kind, value) {
    if (!colorAllowed(env)) return value;
    if (kind === 'cyan') return pc.cyan(value);
    if (kind === 'red') return pc.red(value);
    if (kind === 'green') return pc.green(value);
    return pc.dim(value);
  }

  function frame() {
    if (!active || !interactive) return;
    const icon = paint('cyan', SPINNER[tick % SPINNER.length]);
    const parts = [elapsed(now() - startedAt)];
    const tokens = count(tokenTotal);
    if (tokens) parts.unshift(`${tokens} tokens`);
    if (interruptible) parts.push(INTERRUPT_HINT);
    const paintedLabel = renderShimmer(label, tick, { env });
    write(`\r${CLEAR_LINE}  ${icon} ${paintedLabel} ${paint('dim', '· ' + parts.join(' · '))}`);
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
    const icon = status === 'error' ? paint('red', '✗') : paint('green', '✓');
    const tokens = count(tokenTotal);
    write(`  ${icon} ${finalLabel} ${paint('dim', '· ' + [tokens ? `${tokens} tokens` : null, duration].filter(Boolean).join(' · '))}\n`);
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
