/**
 * Canonical slash-command surface for Agent Sam SDK CLI / shell UX.
 * Consumed by the gorilla-shell example and future `agentsam shell` PTY bridge.
 */

export const SHELL_THEMES = ['NIGHT', 'DAY', 'LAVA', 'VOID'];

/** @type {Array<{ cmd: string, description: string, lane?: string }>} */
export const SLASH_COMMANDS = [
  { cmd: '/help', description: 'Show Agent Sam commands' },
  { cmd: '/status', description: 'Local project, DB, Git, and PTY health', lane: 'local' },
  { cmd: '/context', description: 'Current Git repository and revision', lane: 'git' },
  { cmd: '/pwd', description: 'Print working directory', lane: 'terminal' },
  { cmd: '/cd', description: 'Change working directory', lane: 'terminal' },
  { cmd: '/git', description: 'Git status, diff, branch, commit, and remote', lane: 'git' },
  { cmd: '/db', description: 'Local SQLite status and query helpers', lane: 'data' },
  { cmd: '/agent', description: 'Send a goal to the configured Agent Sam', lane: 'agent' },
  { cmd: '/logs', description: 'Show local Agent Sam execution events', lane: 'observability' },
  { cmd: '/tui', description: 'Switch or preview terminal presentation', lane: 'terminal' },
  { cmd: '/deploy', description: 'Add a cloud adapter and deploy intentionally', lane: 'deploy' },
];

/** Shell UX rollout phases (gorilla-shell → SDK default CLI experience). */
export const SHELL_PHASES = [
  { id: '0-prototype', label: 'Visual prototype + demo scenarios', status: 'complete' },
  { id: 'pty-connection', label: 'Local PTY via agentsam start-local', status: 'current' },
  { id: 'hud-layer', label: 'Quest log, tool gate, XP HUD', status: 'planned' },
  { id: 'buddy-system', label: 'In-shell Agent Sam via MCP', status: 'planned' },
  { id: 'dashboard-embed', label: 'Embeddable shell for IAM dashboard', status: 'planned' },
  { id: 'standalone-pwa', label: 'Installable PWA / SDK default shell', status: 'planned' },
];

export function listSlashCommands(opts = {}) {
  const lane = opts.lane ? String(opts.lane).trim().toLowerCase() : '';
  if (!lane) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((row) => !row.lane || row.lane === lane);
}
