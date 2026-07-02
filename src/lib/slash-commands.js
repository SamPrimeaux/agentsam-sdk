/**
 * Canonical slash-command surface for Agent Sam SDK CLI / shell UX.
 * Consumed by the gorilla-shell example and future `agentsam shell` PTY bridge.
 */

export const SHELL_THEMES = ['NIGHT', 'DAY', 'LAVA', 'VOID'];

/** @type {Array<{ cmd: string, description: string, lane?: string }>} */
export const SLASH_COMMANDS = [
  { cmd: '/cd', description: 'Change working directory', lane: 'terminal' },
  { cmd: '/pwd', description: 'Print working directory', lane: 'terminal' },
  { cmd: '/gh', description: 'GitHub operations (status, PR, issue)', lane: 'git' },
  { cmd: '/wrangler', description: 'Wrangler deploy and bindings', lane: 'deploy' },
  { cmd: '/workspace', description: 'Switch or show active workspace', lane: 'platform' },
  { cmd: '/samiam', description: 'Agent Sam quick invoke', lane: 'agent' },
  { cmd: '/claude', description: 'Route prompt to Claude arm', lane: 'agent' },
  { cmd: '/codex', description: 'Route prompt to Codex arm', lane: 'agent' },
  { cmd: '/tail', description: 'Tail worker logs', lane: 'observability' },
  { cmd: '/d1', description: 'D1 query helper', lane: 'data' },
  { cmd: '/deploy', description: 'Deploy worker (sandbox or prod gate)', lane: 'deploy' },
  { cmd: '/buddy', description: 'Open Agent Sam buddy panel (MCP)', lane: 'agent' },
  { cmd: '/status', description: 'Platform + project health', lane: 'platform' },
  { cmd: '/diagnostics', description: 'Run diagnostic scenario', lane: 'platform' },
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
