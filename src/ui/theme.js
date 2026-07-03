/**
 * @file src/ui/theme.js
 * @description IAM Terminal Theme System — single source of truth for
 * per-lane color identity. Used by:
 *   - xterm.js panels in XTermShell.tsx (pass theme object to Terminal constructor)
 *   - CLI ANSI output in agentsam-sdk (import ANSI constants)
 *   - Splash/HUD renders in both contexts
 *
 * Lane identity:
 *   LOCAL   → amber  (samsmac tunnel, darwin)
 *   CLOUD   → teal   (GCP platform_vm, iam-pty)
 *   SANDBOX → purple (CF container, isolated exec)
 *
 * No dependencies. ESM + CJS compatible (conditional exports in package.json).
 */

// ─────────────────────────────────────────────────────────────────────────────
// RAW COLOR PALETTE
// All hex values live here. Nothing else in the codebase hardcodes colors.
// ─────────────────────────────────────────────────────────────────────────────

export const PALETTE = {
  // Shared blacks / neutrals (terminal voids)
  void:        '#080808',
  void2:       '#0d0d0d',
  void3:       '#121212',
  surface:     '#1a1a1a',
  muted:       '#3d3d3d',
  dim:         '#666666',
  subtle:      '#888888',
  ghost:       '#aaaaaa',
  white:       '#e8e8e8',

  // LOCAL lane — amber/gold (samsmac, darwin_arm64)
  amber900:    '#0d0900',
  amber800:    '#1a1200',
  amber700:    '#2d1f00',
  amber600:    '#78450a',
  amber500:    '#b56a0f',
  amber400:    '#d4820f',
  amber300:    '#f59e0b',  // PRIMARY amber
  amber200:    '#fbbf24',
  amber100:    '#fde68a',
  amber050:    '#fef3c7',

  // CLOUD lane — teal/cyan (GCP, iam-pty, platform_vm)
  teal900:     '#000d0b',
  teal800:     '#001a17',
  teal700:     '#002e28',
  teal600:     '#065f52',
  teal500:     '#0d9488',
  teal400:     '#14b8a6',
  teal300:     '#22d3c8',  // PRIMARY teal
  teal200:     '#5eead4',
  teal100:     '#99f6e4',
  teal050:     '#ccfbf1',

  // SANDBOX lane — purple (CF container, isolated build exec)
  purple900:   '#06020d',
  purple800:   '#0d0520',
  purple700:   '#1e0a3d',
  purple600:   '#4c1d95',
  purple500:   '#6d28d9',
  purple400:   '#7c3aed',
  purple300:   '#a78bfa',  // PRIMARY purple
  purple200:   '#c4b5fd',
  purple100:   '#ddd6fe',
  purple050:   '#ede9fe',

  // Semantic
  success:     '#22c55e',
  warning:     '#f59e0b',
  error:       '#ef4444',
  info:        '#38bdf8',
  connecting:  '#fb923c',
};

// ─────────────────────────────────────────────────────────────────────────────
// LANE THEME OBJECTS
// ─────────────────────────────────────────────────────────────────────────────

const makeLane = ({ bg, bgSubtle, primary, secondary, dim, accent, name, label, icon, tunnelHint }) => ({
  meta: { name, label, icon, tunnelHint },

  xterm: {
    background:          bg,
    foreground:          '#e8e8e8',
    cursor:              primary,
    cursorAccent:        bg,
    selectionBackground: primary + '44',
    selectionForeground: '#e8e8e8',
    black:               '#080808',
    brightBlack:         '#3d3d3d',
    red:                 '#ef4444',
    brightRed:           '#ff6b6b',
    green:               '#22c55e',
    brightGreen:         '#4ade80',
    yellow:              '#f59e0b',
    brightYellow:        '#fbbf24',
    blue:                '#38bdf8',
    brightBlue:          '#7dd3fc',
    magenta:             '#a78bfa',
    brightMagenta:       '#c4b5fd',
    cyan:                '#22d3c8',
    brightCyan:          '#5eead4',
    white:               '#aaaaaa',
    brightWhite:         '#e8e8e8',
    minimumContrastRatio: 4.5,
  },

  ansi: {
    reset:     '\x1b[0m',
    bold:      '\x1b[1m',
    dim:       '\x1b[2m',
    italic:    '\x1b[3m',
    underline: '\x1b[4m',
    primary:   `\x1b[38;2;${hexToRgb(primary)}m`,
    secondary: `\x1b[38;2;${hexToRgb(secondary)}m`,
    dimColor:  `\x1b[38;2;${hexToRgb(dim)}m`,
    accent:    `\x1b[38;2;${hexToRgb(accent)}m`,
    white:     `\x1b[38;2;232;232;232m`,
    ghost:     `\x1b[38;2;136;136;136m`,
    success:   `\x1b[38;2;34;197;94m`,
    warning:   `\x1b[38;2;245;158;11m`,
    error:     `\x1b[38;2;239;68;68m`,
    info:      `\x1b[38;2;56;189;248m`,
  },

  colors: { bg, bgSubtle, primary, secondary, dim, accent },
});

// ─────────────────────────────────────────────────────────────────────────────
// THE THREE LANES
// ─────────────────────────────────────────────────────────────────────────────

export const LOCAL = makeLane({
  name: 'local', label: 'Local', icon: '◈',
  tunnelHint: 'samsmac → localpty.inneranimalmedia.com',
  bg: '#0d0900', bgSubtle: '#1a1200',
  primary: '#f59e0b', secondary: '#fbbf24', dim: '#78450a', accent: '#22d3c8',
});

export const CLOUD = makeLane({
  name: 'cloud', label: 'Cloud', icon: '●',
  tunnelHint: 'inneranimalmedia → terminal.inneranimalmedia.com (GCP iam-tunnel)',
  bg: '#000d0b', bgSubtle: '#001a17',
  primary: '#22d3c8', secondary: '#5eead4', dim: '#065f52', accent: '#f59e0b',
});

export const SANDBOX = makeLane({
  name: 'sandbox', label: 'Sandbox', icon: '◌',
  tunnelHint: 'CF Container → MY_CONTAINER DO (inneranimalmedia)',
  bg: '#06020d', bgSubtle: '#0d0520',
  primary: '#a78bfa', secondary: '#c4b5fd', dim: '#4c1d95', accent: '#22d3c8',
});

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get lane theme by D1 target_type string.
 * @param {'user_hosted_tunnel'|'platform_vm'|'sandbox'|string} targetType
 */
export function getLaneTheme(targetType) {
  switch (targetType) {
    case 'user_hosted_tunnel': return LOCAL;
    case 'platform_vm':        return CLOUD;
    case 'sandbox':            return SANDBOX;
    default:                   return CLOUD;
  }
}

/**
 * Get lane theme by name string (for SDK CLI use).
 * @param {'local'|'cloud'|'sandbox'|string} name
 */
export function getLaneThemeByName(name) {
  switch (name?.toLowerCase()) {
    case 'local':   return LOCAL;
    case 'cloud':   return CLOUD;
    case 'sandbox': return SANDBOX;
    default:        return CLOUD;
  }
}

/** All lanes as ordered array */
export const LANES = [LOCAL, CLOUD, SANDBOX];

// ─────────────────────────────────────────────────────────────────────────────
// STATUS SYMBOLS
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS = {
  ready:      '●',
  connecting: '◐',
  pending:    '◌',
  active:     '◈',
  error:      '✗',
  disabled:   '○',
  arrow:      '▸',
  check:      '✓',
  spinner:    ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'],
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI RENDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function renderDivider(lane, width = 72) {
  const { primary, reset } = lane.ansi;
  return `${primary}${'─'.repeat(width)}${reset}`;
}

export function renderBanner(lane, title, width = 72) {
  const { primary, accent, reset, bold } = lane.ansi;
  const padded = ` ${title} `;
  const sideLen = Math.max(0, Math.floor((width - padded.length) / 2));
  const side = '─'.repeat(sideLen);
  return `${primary}${side}${reset}${accent}${bold}${padded}${reset}${primary}${side}${reset}\n`;
}

export function renderLaneRow(lane, status, description, isActive = false) {
  const { primary, ghost, reset, bold } = lane.ansi;
  const sym = STATUS[status] || STATUS.pending;
  const arrow = isActive ? `${primary}${STATUS.arrow}${reset} ` : '  ';
  let symColor;
  switch (status) {
    case 'ready':      symColor = `\x1b[38;2;34;197;94m`;  break;
    case 'connecting': symColor = `\x1b[38;2;251;146;60m`; break;
    case 'error':      symColor = `\x1b[38;2;239;68;68m`;  break;
    default:           symColor = `\x1b[38;2;102;102;102m`; break;
  }
  return [
    `${arrow}${symColor}${sym}${reset}  `,
    `${bold}${primary}${lane.meta.label.padEnd(10)}${reset}`,
    `${ghost}${description}${reset}`,
  ].join('');
}

export function renderSlashCmd(lane, cmd, description) {
  const { primary, ghost, reset, bold } = lane.ansi;
  return `  ${bold}${primary}${cmd.padEnd(16)}${reset}${ghost}${description}${reset}`;
}

export function renderSpinner(lane, label, tick) {
  const { primary, ghost, reset } = lane.ansi;
  const frame = STATUS.spinner[tick % STATUS.spinner.length];
  return `${primary}${frame}${reset}  ${ghost}${label}${reset}`;
}

export function renderKV(lane, key, value) {
  const { ghost, white, reset } = lane.ansi;
  return `  ${ghost}${key.padEnd(14)}${reset}${white}${value}${reset}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// XTERM.JS INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get complete xterm.js Terminal options for a given lane.
 * @param {'user_hosted_tunnel'|'platform_vm'|'sandbox'} targetType
 */
export function getXtermOptions(targetType) {
  const lane = getLaneTheme(targetType);
  return {
    theme:            lane.xterm,
    fontFamily:       '"Cascadia Code", "JetBrains Mono", "Fira Code", monospace',
    fontSize:         13,
    lineHeight:       1.4,
    letterSpacing:    0.3,
    cursorBlink:      true,
    cursorStyle:      'block',
    scrollback:       5000,
    allowProposedApi: true,
  };
}

/**
 * Get CSS custom property string for a lane — inject on terminal panel wrapper.
 * @param {'user_hosted_tunnel'|'platform_vm'|'sandbox'} targetType
 */
export function getLaneCSSVars(targetType) {
  const lane = getLaneTheme(targetType);
  const { primary, secondary, bg, bgSubtle, dim, accent } = lane.colors;
  return [
    `--lane-primary: ${primary};`,
    `--lane-secondary: ${secondary};`,
    `--lane-bg: ${bg};`,
    `--lane-bg-subtle: ${bgSubtle};`,
    `--lane-dim: ${dim};`,
    `--lane-accent: ${accent};`,
    `--lane-name: "${lane.meta.name}";`,
  ].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r};${g};${b}`;
}

export default {
  PALETTE, STATUS, LOCAL, CLOUD, SANDBOX, LANES,
  getLaneTheme, getLaneThemeByName, getXtermOptions, getLaneCSSVars,
  renderDivider, renderBanner, renderLaneRow, renderSlashCmd,
  renderSpinner, renderKV,
};
