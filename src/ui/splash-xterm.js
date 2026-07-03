/**
 * @file src/ui/splash-xterm.js
 * @description In-app splash renderer for xterm.js panels.
 *
 * Same choreography as splash.js (CLI) but writes to an xterm Terminal
 * instance instead of process.stdout. Used by XTermShell.tsx.
 *
 * Usage in XTermShell.tsx:
 *   import { runXtermSplash } from '@inneranimalmedia/agentsam-sdk/ui/splash-xterm';
 *   import { getXtermOptions } from '@inneranimalmedia/agentsam-sdk/ui/theme';
 *
 *   const targetType = connection?.target_type ?? 'platform_vm';
 *   const term = new Terminal({
 *     ...getXtermOptions(targetType),
 *     cols: dimensions.cols,
 *     rows: dimensions.rows,
 *   });
 *
 *   // After term.open(containerRef.current):
 *   const stopFlicker = await runXtermSplash(term, {
 *     apiBase: 'https://inneranimalmedia.com',
 *     workspaceId: activeWorkspace?.id,
 *     authToken: session?.token,
 *     targetType,
 *     skipArt: !isFirstSession,
 *   });
 *
 *   // On cleanup:
 *   return () => { stopFlicker(); term.dispose(); };
 */

import { PALETTE, getLaneTheme } from './theme.js';
import { probeAll } from './splash.js';

// ─────────────────────────────────────────────────────────────────────────────
// xterm write helpers
// ─────────────────────────────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

const X = {
  reset:     `${CSI}0m`,
  bold:      `${CSI}1m`,
  hide:      `${CSI}?25l`,
  show:      `${CSI}?25h`,
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// COLOR BUILDER (per-lane)
// ─────────────────────────────────────────────────────────────────────────────

function buildColors() {
  const R = X.reset;
  const B = X.bold;
  return {
    R, B,
    TEAL:   X.fg(PALETTE.teal300),
    AMBER:  X.fg(PALETTE.amber300),
    STONE:  X.fg('#3a3530'),
    STONE2: X.fg('#2a2520'),
    VINE:   X.fg('#1a4a2a'),
    VINE2:  X.fg('#0f6b3a'),
    FIRE1:  X.fg('#f97316'),
    FIRE2:  X.fg('#ef4444'),
    FIREY:  X.fg('#fef08a'),
    GRILL:  X.fg('#1e2830'),
    GRILL2: X.fg('#2d3d4a'),
    PELT:   X.fg('#8b6f5a'),
    DIM:    X.fg('#444444'),
    GHOST:  X.fg('#888888'),
    WHT:    X.fg('#e2e8f0'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE DATA
// ─────────────────────────────────────────────────────────────────────────────

function gorillaRows(C) {
  const { R, GRILL, GRILL2, PELT, DIM } = C;
  return [
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
}

function titleBoxLines(C) {
  const { R, B, TEAL, AMBER } = C;
  const wide = 26;
  const h = `${TEAL}═${R}`;
  return [
    `${TEAL}╔${R}${h.repeat(wide)}${TEAL}╗${R}`,
    `${TEAL}║${R}  ${B}${AMBER}INNERANIMAL MEDIA${R}  ${TEAL}║${R}`,
    `${TEAL}║${R}  ${TEAL}inneranimalmedia.com${R}     ${TEAL}║${R}`,
    `${TEAL}╚${R}${h.repeat(wide)}${TEAL}╝${R}`,
  ];
}

function ladderRows(C) {
  const { R, TEAL } = C;
  return [
    `    ${TEAL}║${R}   ${TEAL}║${R}`,
    `    ${TEAL}╠═══╣${R}`,
    `    ${TEAL}║${R}   ${TEAL}║${R}`,
    `    ${TEAL}╠═══╣${R}`,
    `    ${TEAL}║${R}   ${TEAL}║${R}`,
    `    ${TEAL}╠═══╣${R}`,
    `    ${TEAL}║${R}   ${TEAL}║${R}`,
  ];
}

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

function renderHUDLine(states, C) {
  const { R, B, TEAL, GHOST, WHT, DIM } = C;
  return HUD_ITEMS.map((item, i) => {
    const state = states[item.key] || 'checking';
    let stateStr;
    if (state === 'ready') {
      stateStr = `${TEAL}● ${READY_LABELS[item.key]}${R}`;
    } else if (state === 'checking') {
      stateStr = `${GHOST}◌ checking...${R}`;
    } else if (state === 'error') {
      stateStr = `${X.fg('#ef4444')}✗ error${R}`;
    } else {
      stateStr = `${X.fg('#666666')}○ offline${R}`;
    }
    const div = i < HUD_ITEMS.length - 1 ? `  ${DIM}│${R}  ` : '';
    return `${GHOST}${item.icon}${R}  ${B}${WHT}${item.label}${R}  ${stateStr}${div}`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN XTERM SPLASH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('@xterm/xterm').Terminal} term
 * @param {object} opts
 * @param {string}  opts.apiBase
 * @param {string}  opts.workspaceId
 * @param {string}  opts.authToken
 * @param {'user_hosted_tunnel'|'platform_vm'|'sandbox'} opts.targetType
 * @param {boolean} opts.skipArt
 * @returns {Promise<() => void>} stopFlicker — call on unmount
 */
export async function runXtermSplash(term, {
  apiBase = '',
  workspaceId = '',
  authToken = '',
  targetType = 'platform_vm',
  skipArt = false,
} = {}) {

  const lane = getLaneTheme(targetType);
  const C = buildColors();
  const { R, B, TEAL, AMBER, GHOST, WHT, DIM, STONE, STONE2, FIRE1, FIRE2 } = C;
  const PRIMARY = X.fg(lane.colors.primary);
  const W = term.cols || 80;

  const w  = (s) => term.write(s);
  const wl = (s = '') => term.write(s + '\r\n');

  w(X.hide);
  w(`${ESC}c`); // full reset
  await sleep(60);

  // cd verb flash
  w(`  ${GHOST}$ ${R}${AMBER}cd ~/inneranimalmedia${R}`);
  await sleep(340);
  w(`\r${X.clearLine}`);
  await sleep(60);

  if (!skipArt) {
    wl();

    const rows  = gorillaRows(C);
    const title = titleBoxLines(C);
    const TITLE_START = 3;

    for (let i = 0; i < rows.length; i++) {
      const titleIdx = i - TITLE_START;
      const titlePart = (titleIdx >= 0 && titleIdx < title.length)
        ? '  ' + title[titleIdx]
        : '';
      wl(`  ${rows[i]}${titlePart}`);
      await sleep(24);
    }

    wl();

    // Torches
    w(`  ${FIRE1}  ▓▓▓${R}`);
    await sleep(90);
    wl(`${' '.repeat(Math.max(0, W - 14))}${FIRE2}▓▓▓${R}`);
    await sleep(30);

    // Ledge
    w('  ');
    for (let i = 0; i < W - 4; i++) {
      w((i % 2 === 0) ? `${STONE}█${R}` : `${STONE2}▓${R}`);
      await sleep(4);
    }
    wl();
    wl(`  ${DIM}${'╌'.repeat(W - 4)}${R}`);
    await sleep(50);

    // Ladder
    for (const rung of ladderRows(C)) {
      wl(rung);
      await sleep(30);
    }
  }

  wl();

  // Start prompt
  await sleep(skipArt ? 0 : 70);
  wl(`        ${B}${AMBER}Start ${PRIMARY}▸${R}`);
  await sleep(40);
  wl(`        ${GHOST}Type a command to begin.${R}`);
  await sleep(skipArt ? 0 : 70);
  wl();

  // HUD — fire probes in parallel
  const probePromise = probeAll({ apiBase, workspaceId, authToken });
  const initStates = { workspace: 'checking', runtime: 'checking', tunnel: 'checking', agent: 'checking' };

  wl(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
  wl();
  w(`  ${renderHUDLine(initStates, C)}`);
  wl(); wl();
  wl(`  ${DIM}${'─'.repeat(W - 4)}${R}`);
  wl();

  // Update HUD in-place when probes resolve
  const LINES_BELOW = 4;
  probePromise.then(resolved => {
    w(X.up(LINES_BELOW));
    w(`\r${X.clearLine}`);
    w(`  ${renderHUDLine(resolved, C)}`);
    w('\r\n'.repeat(LINES_BELOW));
    w(X.show);
    w(`  ${PRIMARY}>${R}  `);
  });

  // Torch flicker is handled via CSS animation on the panel wrapper
  // (terminal-lanes.css) — xterm.js decoration API in Phase 2.
  return () => {};
}

export default { runXtermSplash };
