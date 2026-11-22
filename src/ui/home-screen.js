/**
 * @file src/ui/home-screen.js
 * @description Full-screen home for bare `agentsam`: the official AgentSam mark,
 * large and centered, with the prompt anchored at the bottom. Colors come from
 * the terminal theme tokens; the mark itself is generated from the brand SVG.
 */
import { AGENTSAM_MARK } from './brand/agentsam-mark.generated.js';
import { PALETTE } from './theme.js';

/** Rows the shell prints below the home screen: status line, hints, blank, prompt. */
export const HOME_RESERVED_ROWS = 4;
const HEADER_ROWS = 3;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function fg(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

/** Largest mark that fits the terminal with breathing room, or null when none does. */
export function pickMark(cols, rows) {
  const room = rows - HOME_RESERVED_ROWS - HEADER_ROWS;
  for (const size of ['large', 'medium', 'small']) {
    const mark = AGENTSAM_MARK[size];
    if (mark.length + 2 <= room && mark[0].length + 4 <= cols) return mark;
  }
  return null;
}

export function renderHomeScreen({ version, cwd, branch = '', cols = 80, rows = 24, color = true } = {}) {
  const paint = (text, code) => (color ? code + text + RESET : text);
  const where = branch ? `${cwd} · ${branch}` : cwd;
  const header = [
    '',
    `  ${paint('>_', fg(PALETTE.subtle))} ${paint('AgentSam', BOLD)} ${paint(`(v${version})`, fg(PALETTE.dim))}`,
    `     ${paint(where, fg(PALETTE.dim))}`,
  ];
  const mark = pickMark(cols, rows);
  if (!mark) return `${header.join('\n')}\n`;

  const lines = [...header];
  const body = rows - HOME_RESERVED_ROWS - HEADER_ROWS;
  for (let i = Math.floor((body - mark.length) / 2); i > 0; i -= 1) lines.push('');
  const left = ' '.repeat(Math.max(0, Math.floor((cols - mark[0].length) / 2)));
  for (const row of mark) lines.push(left + paint(row, fg(PALETTE.ghost)));
  while (lines.length < rows - HOME_RESERVED_ROWS) lines.push('');
  return `${lines.join('\n')}\n`;
}
