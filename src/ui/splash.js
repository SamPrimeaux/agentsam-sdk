/**
 * @file src/ui/splash.js
 * @description Cinematic intro sequence for `agentsam shell` and `agentsam init`.
 *
 * Choreography (cold start, ~1.25s total):
 *   0ms    — black void
 *   60ms   — cd ~/inneranimalmedia flashes then erases (verb, not description)
 *   200ms  — gorilla renders row by row (28ms/row)
 *   600ms  — title border + INNERANIMAL MEDIA letter by letter
 *   750ms  — stone ledge draws L→R
 *   820ms  — ladder rungs appear
 *   900ms  — "Start ▸" in amber
 *   950ms  — HUD bar appears (all 4 items: checking...)
 *   950ms  — probes fire in parallel
 *  1250ms  — HUD updates in-place with real status
 *  1300ms  — prompt cursor appears
 *
 * Usage:
 *   import { runSplash } from './ui/splash.js';
 *   const status = await runSplash({ apiBase, workspaceId, authToken, lane });
 *   // returns { workspace, runtime, tunnel, agent }
 */

import { PALETTE, getLaneTheme } from './theme.js';

// ─────────────────────────────────────────────────────────────────────────────
// ANSI primitives
// ─────────────────────────────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

const A = {
  reset:     `${CSI}0m`,
  bold:      `${CSI}1m`,
  dim:       `${CSI}2m`,
  hide:      `${CSI}?25l`,
  show:      `${CSI}?25h`,
  clear:     `${CSI}2J${CSI}H`,
  clearLine: `${CSI}2K\r`,
  up:        (n = 1) => `${CSI}${n}A`,
  fg: (hex) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `${CSI}38;2;${r};${g};${b}m`;
  },
};

const w   = (s) => process.stdout.write(s);
const wln = (s = '') => process.stdout.write(s + '\n');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// COLOR SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────

const TEAL   = A.fg(PALETTE.teal300);
const AMBER  = A.fg(PALETTE.amber300);
const AMBER2 = A.fg(PALETTE.amber200);
const STONE  = A.fg('#3a3530');
const STONE2 = A.fg('#2a2520');
const VINE   = A.fg('#1a4a2a');
const VINE2  = A.fg('#0f6b3a');
const FIRE1  = A.fg('#f97316');
const FIRE2  = A.fg('#ef4444');
const FIREY  = A.fg('#fef08a');
const GRILL  = A.fg('#1e2830');
const GRILL2 = A.fg('#2d3d4a');
const PELT   = A.fg('#8b6f5a');
const DIM    = A.fg('#444444');
const GHOST  = A.fg('#888888');
const WHT    = A.fg('#e2e8f0');
const R      = A.reset;
const B      = A.bold;

// ─────────────────────────────────────────────────────────────────────────────
// GORILLA ART — 12 rows, pre-colored
// ─────────────────────────────────────────────────────────────────────────────

const GORILLA_ROWS = [
  `            ${DIM}░░▒${R}${GRILL2}▓▓▓▓▓▓▓▓${R}${DIM}▒░░${R}`,
  `          ${DIM}░${R}${GRILL2}▒▓▓${R}${GRILL}█████████████${R}${GRILL2}▓▓▒${R}${DIM}░${R}`,
  `         ${GRILL2}▒▓${R}${GRILL}███${R}${GRILL2}▒▒${R}${GRILL}████████${R}${GRILL2}▒▒${R}${GRILL}███${R}${GRILL2}▓▒${R}`,
  `         ${GRILL2}▓${R}${GRILL}████${R}  ${DIM}▒▒▒▒▒▒▒▒${R}  ${GRILL}████${R}${GRILL2}▓${R}`,
  `        ${GRILL}▓███${R}${GRILL2}▒${R} ${PELT}██${R}${DIM}▒${R}${PELT}████${R}${DIM}▒${R}${PELT}██${R} ${GRILL2}▒${R}${GRILL}███▓${R}`,
  `        ${GRILL}████${R}  ${PELT}███${R}${DIM}▒▒▒▒${R}${PELT}███${R}  ${GRILL}████${R}`,
  `        ${GRILL}████${R}${GRILL2}▒${R}  ${PELT}██████████${R}  ${GRILL2}▒${R}${GRILL}████${R}`,
  `        ${GRILL}████${R}   ${DIM}▒▒▒▒▒▒▒▒▒▒${R}   ${GRILL}████${R}`,
  `       ${GRILL2}▒${R}${GRILL}████${R}${GRILL2}▓▓▓${R}${GRILL}████████████${R}${GRILL2}▓▓▓${R}${GRILL}████${R}${GRILL2}▒${R}`,
  `       ${GRILL}██████████████████████████${R}`,
  `     ${DIM}▒▒${R}${GRILL}████████${R}${GRILL2}▒▒▒▒▒▒▒▒▒▒▒▒${R}${GRILL}████████${R}${DIM}▒▒${R}`,
  `    ${PELT}▓${R}${GRILL}██████████${R}${DIM}░░░░░░░░░░░░░░${R}${GRILL}██████████${R}${PELT}▓${R}`,
];

// ─────────────────────────────────────────────────────────────────────────────
// TITLE BOX
// ─────────────────────────────────────────────────────────────────────────────

function titleBoxLines() {
  const wide = 26;
  const h = `${TEAL}═${R}`;
  return [
    `${TEAL}╔${R}${h.repeat(wide)}${TEAL}╗${R}`,
    `${TEAL}║${R}  ${B}${AMBER}INNERANIMAL MEDIA${R}  ${TEAL}║${R}`,
    `${TEAL}║${R}  ${TEAL}inneranimalmedia.com${R}     ${TEAL}║${R}`,
    `${TEAL}╚${R}${h.repeat(wide)}${TEAL}╝${R}`,
  ];
}

const LADDER_ROWS = [
  `    ${TEAL}║${R}   ${TEAL}║${R}`,
  `    ${TEAL}╠═══╣${R}`,
  `    ${TEAL}║${R}   ${TEAL}║${R}`,
  `    ${TEAL}╠═══╣${R}`,
  `    ${TEAL}║${R}   ${TEAL}║${R}`,
  `    ${TEAL}╠═══╣${R}`,
  `    ${TEAL}║${R}   ${TEAL}║${R}`,
];

// ─────────────────────────────────────────────────────────────────────────────
// HUD RENDER
// ─────────────────────────────────────────────────────────────────────────────

const HUD_ITEMS = [
  { key: 'workspace', icon: '⊞', label: 'Workspace' },
  { key: 'runtime',   icon: '▣', label: 'Runtime'   },
  { key: 'tunnel',    icon: '⟁', label: 'Tunnel'    },
  { key: 'agent',     icon: '⬡', label: 'Agent'     },
];

const READY_LABELS = {
  workspace: 'active',
  runtime:   'ready',
  tunnel:    'connected',
  agent:     'online',
};

export function renderHUDLine(states) {
  return HUD_ITEMS.map((item, i) => {
    const state = states[item.key] || 'checking';
    let stateStr;
    if (state === 'ready') {
      stateStr = `${TEAL}● ${READY_LABELS[item.key]}${R}`;
    } else if (state === 'checking') {
      stateStr = `${GHOST}◌ checking...${R}`;
    } else if (state === 'error') {
      stateStr = `${A.fg('#ef4444')}✗ error${R}`;
    } else {
      stateStr = `${A.fg('#666666')}○ offline${R}`;
    }
    const div = i < HUD_ITEMS.length - 1 ? `  ${DIM}│${R}  ` : '';
    return `${GHOST}${item.icon}${R}  ${B}${WHT}${item.label}${R}  ${stateStr}${div}`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS PROBES
// Fire in parallel — each returns 'ready' | 'error' | 'offline'
// ─────────────────────────────────────────────────────────────────────────────

export async function probeAll({ apiBase = '', workspaceId = '', authToken = '' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken   ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(workspaceId ? { 'x-iam-workspace-id': workspaceId }    : {}),
  };

  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  const safe = async (fn) => { try { return await Promise.race([fn(), timeout(2500)]); } catch { return 'offline'; } };

  const [workspace, runtime, tunnel, agent] = await Promise.all([
    safe(async () => {
      const r = await fetch(`${apiBase}/api/agent/session`, { headers });
      return r.ok ? 'ready' : 'error';
    }),
    safe(async () => {
      const r = await fetch(`${apiBase}/api/terminal/connections/targets`, { headers });
      if (!r.ok) return 'offline';
      const data = await r.json();
      const cloud = data.targets?.find(t => t.target_type === 'platform_vm');
      return cloud?.healthy ? 'ready' : 'offline';
    }),
    safe(async () => {
      const r = await fetch(`${apiBase}/api/terminal/connections/targets`, { headers });
      if (!r.ok) return 'offline';
      const data = await r.json();
      const local = data.targets?.find(t => t.target_type === 'user_hosted_tunnel');
      return local?.healthy ? 'ready' : 'offline';
    }),
    safe(async () => {
      const r = await fetch(`${apiBase}/api/agent/terminal/config-status`, { headers });
      if (!r.ok) return 'offline';
      const data = await r.json();
      return data.can_run_pty ? 'ready' : 'offline';
    }),
  ]);

  return { workspace, runtime, tunnel, agent };
}

// ─────────────────────────────────────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export function createSpinner(initialLabel = '', lane = 'cloud') {
  const laneTheme = getLaneTheme(
    lane === 'local' ? 'user_hosted_tunnel' :
    lane === 'sandbox' ? 'sandbox' : 'platform_vm'
  );
  const PRIMARY = A.fg(laneTheme.colors.primary);
  let label = initialLabel;
  let tick = 0;
  let running = true;
  w(A.hide);
  const interval = setInterval(() => {
    if (!running) return;
    const frame = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
    w(`\r  ${PRIMARY}${frame}${R}  ${GHOST}${label}${R}${A.clearLine.slice(1)}`);
    tick++;
  }, 80);
  return {
    update:  (l) => { label = l; },
    succeed: (l = label) => {
      running = false; clearInterval(interval);
      wln(`\r  ${TEAL}✓${R}  ${WHT}${l}${R}${A.clearLine.slice(1)}`);
      w(A.show);
    },
    fail: (l = label) => {
      running = false; clearInterval(interval);
      wln(`\r  ${A.fg('#ef4444')}✗${R}  ${WHT}${l}${R}${A.clearLine.slice(1)}`);
      w(A.show);
    },
    stop: () => {
      running = false; clearInterval(interval);
      w(`\r${A.clearLine}`); w(A.show);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SLASH REGISTRY PRINT
// ─────────────────────────────────────────────────────────────────────────────

export function printSlashRegistry(commands, lane = 'cloud') {
  const laneTheme = getLaneTheme(
    lane === 'local' ? 'user_hosted_tunnel' :
    lane === 'sandbox' ? 'sandbox' : 'platform_vm'
  );
  const PRIMARY = A.fg(laneTheme.colors.primary);
  const W = process.stdout.columns || 80;
  wln();
  wln(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
  wln(`  ${GHOST}Slash commands${R}`);
  wln();
  for (const { cmd, description } of commands) {
    wln(`  ${B}${PRIMARY}${cmd.padEnd(18)}${R}${GHOST}${description}${R}`);
  }
  wln();
  wln(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
  wln();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SPLASH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full cinematic splash.
 * @param {object} opts
 * @param {string}  opts.apiBase
 * @param {string}  opts.workspaceId
 * @param {string}  opts.authToken
 * @param {boolean} opts.skipArt     — skip gorilla on repeat sessions
 * @param {string}  opts.lane        — 'cloud'|'local'|'sandbox'
 * @param {number}  opts.cols
 * @returns {Promise<{workspace, runtime, tunnel, agent}>}
 */
export async function runSplash({
  apiBase = '',
  workspaceId = '',
  authToken = '',
  skipArt = false,
  lane = 'cloud',
  cols,
} = {}) {

  const W = cols || process.stdout.columns || 80;
  const laneTheme = getLaneTheme(
    lane === 'local' ? 'user_hosted_tunnel' :
    lane === 'sandbox' ? 'sandbox' : 'platform_vm'
  );
  const PRIMARY = A.fg(laneTheme.colors.primary);

  w(A.hide);

  try {
    w(A.clear);
    await sleep(60);

    // cd verb flash — shows the command, then erases it
    w(`  ${GHOST}$ ${R}${AMBER}cd ~/inneranimalmedia${R}`);
    await sleep(340);
    w(`\r${A.clearLine}`);
    await sleep(60);

    if (!skipArt) {
      wln();

      const title = titleBoxLines();
      const TITLE_START = 3;

      for (let i = 0; i < GORILLA_ROWS.length; i++) {
        const titleIdx = i - TITLE_START;
        const titlePart = (titleIdx >= 0 && titleIdx < title.length)
          ? '  ' + title[titleIdx]
          : '';
        wln(`  ${GORILLA_ROWS[i]}${titlePart}`);
        await sleep(26);
      }

      wln();

      // Torches
      w(`  ${FIRE1}  ▓▓▓${R}`);
      await sleep(90);
      wln(`${' '.repeat(Math.max(0, W - 14))}${FIRE2}▓▓▓${R}`);
      await sleep(30);

      // Ledge L→R
      w('  ');
      for (let i = 0; i < W - 4; i++) {
        w((i % 2 === 0) ? `${STONE}█${R}` : `${STONE2}▓${R}`);
        await sleep(4);
      }
      wln();
      wln(`  ${DIM}${'╌'.repeat(W - 4)}${R}`);
      await sleep(50);

      // Ladder
      for (const rung of LADDER_ROWS) {
        wln(rung);
        await sleep(32);
      }
    }

    wln();

    // Start prompt
    await sleep(skipArt ? 0 : 70);
    wln(`        ${B}${AMBER}Start ${PRIMARY}▸${R}`);
    await sleep(40);
    wln(`        ${GHOST}Type a command to begin.${R}`);
    await sleep(skipArt ? 0 : 70);
    wln();

    // HUD — fire probes in parallel
    const probePromise = probeAll({ apiBase, workspaceId, authToken });
    const initStates = { workspace: 'checking', runtime: 'checking', tunnel: 'checking', agent: 'checking' };

    wln(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
    wln();
    w(`  ${renderHUDLine(initStates)}`);
    wln(); wln();
    wln(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
    wln();

    // Update HUD when probes resolve
    const LINES_BELOW = 4;
    const resolvedStates = await probePromise;
    w(A.up(LINES_BELOW));
    w(`\r${A.clearLine}`);
    w(`  ${renderHUDLine(resolvedStates)}`);
    w('\n'.repeat(LINES_BELOW));

    await sleep(80);
    w(`  ${PRIMARY}>${R}  `);
    w(A.show);

    return resolvedStates;

  } catch (err) {
    w(A.show);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT HEADER (repeat sessions)
// ─────────────────────────────────────────────────────────────────────────────

export async function runCompactHeader({ apiBase, workspaceId, authToken, lane = 'cloud' } = {}) {
  const laneTheme = getLaneTheme(
    lane === 'local' ? 'user_hosted_tunnel' :
    lane === 'sandbox' ? 'sandbox' : 'platform_vm'
  );
  const PRIMARY = A.fg(laneTheme.colors.primary);
  const W = process.stdout.columns || 80;

  w(A.hide);
  w(A.clear);

  wln(`  ${B}${PRIMARY}${laneTheme.meta.icon}  Agent Sam${R}  ${GHOST}${laneTheme.meta.label.toUpperCase()}${R}  ${DIM}${laneTheme.meta.tunnelHint}${R}`);
  wln(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
  wln();

  const probePromise = probeAll({ apiBase, workspaceId, authToken });
  const init = { workspace: 'checking', runtime: 'checking', tunnel: 'checking', agent: 'checking' };
  w(`  ${renderHUDLine(init)}`);
  wln(); wln();

  const resolved = await probePromise;
  w(A.up(2));
  w(`\r${A.clearLine}`);
  w(`  ${renderHUDLine(resolved)}`);
  w('\n'.repeat(2));

  w(A.show);
  w(`  ${PRIMARY}>${R}  `);
  return resolved;
}

export default { runSplash, runCompactHeader, printSlashRegistry, createSpinner, probeAll, renderHUDLine };
