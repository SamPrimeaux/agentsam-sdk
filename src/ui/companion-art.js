import { readFileSync } from 'node:fs';

const roles = { d: [90, 100], m: [37, 47], h: [97, 107] };
const RESET = '\x1b[0m';

export function companionTerminalArt() {
  const art = JSON.parse(readFileSync(new URL('./art/geaux_boot.json', import.meta.url), 'utf8'));
  if (art.schema !== 'agentsam.ansi-art.v1' || art.companionId !== 'geaux') {
    throw new Error('Companion terminal art contract invalid');
  }
  return art;
}

export function renderCompanionTerminalArt(grid, { color = true } = {}) {
  if (!Array.isArray(grid) || !grid.length || grid.some((row) => row.length !== grid[0].length)) return '';
  const rows = grid.length % 2 ? [...grid, '.'.repeat(grid[0].length)] : grid;
  const lines = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = '';
    for (let x = 0; x < rows[y].length; x++) {
      const top = rows[y][x], bottom = rows[y + 1][x];
      if (top === '.' && bottom === '.') line += ' ';
      else if (!color) line += top !== '.' && bottom !== '.' ? '█' : top !== '.' ? '▀' : '▄';
      else if (top === '.') line += '\x1b[' + roles[bottom][0] + 'm▄' + RESET;
      else if (bottom === '.') line += '\x1b[' + roles[top][0] + 'm▀' + RESET;
      else line += '\x1b[' + roles[top][0] + ';' + roles[bottom][1] + 'm▀' + RESET;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function brandedTerminalHeader({ project, model, cwd, version, color = true, width = 80 }) {
  const info = ['AgentSam CLI  v' + version, model, cwd, project];
  if (width < 52) return info.join('\n');
  const art = companionTerminalArt();
  const rows = renderCompanionTerminalArt(art.grid, { color }).split('\n');
  while (info.length < rows.length) info.push('');
  return rows.map((row, index) => row + '  ' + (info[index] || '')).join('\n');
}
