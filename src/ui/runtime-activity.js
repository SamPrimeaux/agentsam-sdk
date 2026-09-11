import pc from 'picocolors';

const CLEAR_LINE = '\x1b[2K';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const SPINNER = ['◔', '◑', '◕', '●'];
const PANEL_WIDTH = 34;
const PANEL_INNER = PANEL_WIDTH - 2;
const PANEL_LINES = 5;

const THINK_FRAMES = [
  ['  ·     ·', '     ○', '  ·     ·'],
  ['  ✦     ·', '    (○)', '  ·     ✦'],
  ['  ·     ✦', '    (●)', '  ✦     ·'],
  ['    ✦', '   ( ◯ )', '    ✦'],
  ['  ✦     ✦', '    (●)', '  ✦     ✦'],
  ['  ·     ✦', '    (○)', '  ✦     ·'],
];

function elapsedLabel(ms) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function truncate(value, max) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function center(value, width) {
  const text = truncate(value, width);
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  const right = Math.max(0, width - text.length - left);
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`;
}

function titledBorder(title, width, left, right) {
  const label = ` ${title} `;
  const fill = Math.max(0, width - left.length - right.length - label.length);
  return `${left}${label}${'─'.repeat(fill)}${right}`;
}

function subtitledBorder(subtitle, width, left, right) {
  const label = ` ${truncate(subtitle, width - 4)} `;
  const fill = Math.max(0, width - left.length - right.length - label.length);
  return `${left}${label}${'─'.repeat(fill)}${right}`;
}

export function canAnimateTerminal({ stdout = process.stdout, env = process.env } = {}) {
  if (!stdout?.isTTY) return false;
  if (String(env.TERM || '').toLowerCase() === 'dumb') return false;
  if (String(env.CI || '').trim()) return false;
  return true;
}

export function renderRuntimeActivityFrame({
  label = 'Agent Sam',
  phase = 'thinking',
  tick = 0,
  elapsedMs = 0,
} = {}) {
  const frame = SPINNER[Math.abs(Number(tick) || 0) % SPINNER.length];
  return `  ${pc.cyan(frame)} ${pc.bold(label)} ${pc.dim(`· ${phase}`)} ${pc.dim(`· ${elapsedLabel(elapsedMs)}`)}`;
}

export function renderRuntimeActivityPanel({
  label = 'Agent Sam',
  phase = 'thinking',
  tick = 0,
  elapsedMs = 0,
  status = 'active',
  locality = 'working locally',
} = {}) {
  const frame = THINK_FRAMES[Math.abs(Number(tick) || 0) % THINK_FRAMES.length];
  const border = status === 'success' ? pc.green : status === 'error' ? pc.red : pc.cyan;
  const body = status === 'error' ? pc.red : pc.cyan;
  const title = titledBorder(label, PANEL_WIDTH, '╭─', '╮');
  const subtitle = status === 'active'
    ? `${phase} · ${locality}`
    : `${phase} · ${elapsedLabel(elapsedMs)}`;
  return [
    border(title),
    `${border('│')}${body(center(frame[0], PANEL_INNER))}${border('│')}`,
    `${border('│')}${body(center(frame[1], PANEL_INNER))}${border('│')}`,
    `${border('│')}${body(center(frame[2], PANEL_INNER))}${border('│')}`,
    border(subtitledBorder(subtitle, PANEL_WIDTH, '╰─', '╯')),
  ].join('\n');
}

export function renderRuntimeActivityResult({
  label = 'Agent Sam',
  status = 'success',
  phase = status === 'success' ? 'done' : 'failed',
  elapsedMs = 0,
} = {}) {
  const ok = status === 'success';
  const symbol = ok ? pc.green('✓') : pc.red('✗');
  return `  ${symbol} ${pc.bold(label)} ${pc.dim(`· ${phase}`)} ${pc.dim(`· ${elapsedLabel(elapsedMs)}`)}`;
}

/**
 * Live terminal activity for product runtime operations.
 *
 * This is shipped product UI, not a preview renderer. It remains quiet in pipes/CI,
 * and only uses cursor redraw when stdout is an interactive terminal.
 */
export function createRuntimeActivity(options = {}) {
  const write = options.write || process.stdout.write.bind(process.stdout);
  const now = options.now || (() => Date.now());
  const setTimer = options.setInterval || globalThis.setInterval;
  const clearTimer = options.clearInterval || globalThis.clearInterval;
  const interactive = options.interactive ?? canAnimateTerminal(options);
  const intervalMs = Math.max(40, Number(options.intervalMs) || 90);
  const label = String(options.label || 'Agent Sam');
  const locality = String(options.locality || 'working locally');

  let phase = String(options.phase || 'thinking');
  let startedAt = 0;
  let tick = 0;
  let timer = null;
  let started = false;
  let finished = false;
  let drawn = false;

  const writePanel = (status = 'active') => {
    if (!interactive || !started) return;
    const elapsedMs = Math.max(0, now() - startedAt);
    if (drawn) write(`\x1b[${PANEL_LINES}A`);
    const panel = renderRuntimeActivityPanel({ label, phase, tick, elapsedMs, status, locality });
    for (const line of panel.split('\n')) write(`\r${CLEAR_LINE}${line}\n`);
    drawn = true;
    tick += 1;
  };

  const draw = () => {
    if (finished) return;
    writePanel('active');
  };

  const start = (nextPhase = phase) => {
    if (started || finished) return;
    phase = String(nextPhase || phase);
    started = true;
    startedAt = now();
    if (!interactive) return;
    write(HIDE_CURSOR);
    draw();
    timer = setTimer(draw, intervalMs);
  };

  const update = (nextPhase) => {
    if (nextPhase) phase = String(nextPhase);
    if (!started) start(phase);
    draw();
  };

  const finish = ({ status = 'success', resultPhase } = {}) => {
    if (finished) return;
    if (timer) clearTimer(timer);
    timer = null;
    phase = resultPhase || (status === 'success' ? 'done' : 'failed');
    if (interactive && started) {
      writePanel(status === 'success' ? 'success' : 'error');
      write(SHOW_CURSOR);
    }
    finished = true;
  };

  return {
    get interactive() { return interactive; },
    start,
    update,
    succeed(phaseName = 'done') { finish({ status: 'success', resultPhase: phaseName }); },
    fail(phaseName = 'failed') { finish({ status: 'error', resultPhase: phaseName }); },
    stop() { finish({ status: 'success', resultPhase: 'done' }); },
  };
}

/**
 * Maps portable runtime events onto the customer terminal without making the renderer
 * the authority for execution. Hosts may feed richer telemetry into the same seam.
 */
export function phaseForRuntimeEvent(event = {}) {
  const type = String(event.type || '');
  if (type === 'model.started' || type === 'model.delta') return 'thinking';
  if (type === 'tool.started') return event.tool ? `using ${event.tool}` : 'using tool';
  if (type === 'context.compaction.started') return 'tidying context';
  if (type === 'context.compaction.completed') return 'context ready';
  if (type === 'run.started') return 'working';
  return null;
}
