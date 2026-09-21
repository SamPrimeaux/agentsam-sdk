/** Canonical, implemented slash-command surface for Agent Sam SDK CLI. */

export const SHELL_THEMES = ['NIGHT', 'DAY', 'LAVA', 'VOID'];

export const SLASH_COMMANDS = [
  { cmd: '/model', description: 'Choose exact model, reasoning level, and processing tier', lane: 'model' },
  { cmd: '/reasoning', description: 'Set reasoning effort for the selected model', lane: 'model' },
  { cmd: '/fast', description: 'Use provider Fast processing when the selected model supports it', lane: 'model' },
  { cmd: '/flex', description: 'Use provider Flex processing when the selected model supports it', lane: 'model' },
  { cmd: '/standard', description: 'Return to Standard provider processing', lane: 'model' },
  { cmd: '/compact', description: 'Compact active provider context; status shows support, threshold, and receipt', lane: 'context' },
  { cmd: '/context', description: 'Show model context economics; add repo for Git bridge context', lane: 'context' },
  { cmd: '/status', description: 'Local project, DB, Git, and PTY health', lane: 'local' },
  { cmd: '/models', description: 'Probe providers and provider-verified known models', lane: 'model' },
  { cmd: '/providers', description: 'Configure and verify machine provider credentials', lane: 'model' },
  { cmd: '/login', description: 'Sign in to Inner Animal Media and save the machine-local Agent Sam session', lane: 'identity' },
  { cmd: '/logout', description: 'Sign out locally without deleting provider credentials', lane: 'identity' },
  { cmd: '/whoami', description: 'Show authenticated account identity and safe credential status', lane: 'identity' },
  { cmd: '/session', description: 'Show current session usage, cost, and resume receipt', lane: 'observability' },
  { cmd: '/usage', description: 'Show token usage, spend breakdown, and resume command', lane: 'observability' },
  { cmd: '/cf', description: 'Cloudflare native reads, Wrangler status, and CPU profile analysis', lane: 'cloudflare' },
  { cmd: '/connections', description: 'Inspect live account, terminal, Worker, and Cloudflare connection evidence', lane: 'cloudflare' },
  { cmd: '/tunnel', description: 'Choose and run a real Cloudflare Tunnel through Wrangler', lane: 'cloudflare' },
  { cmd: '/settings', description: 'Choose project, runtime, terminal, and model policy' },
  { cmd: '/pwd', description: 'Print working directory', lane: 'terminal' },
  { cmd: '/cd', description: 'Change working directory', lane: 'terminal' },
  { cmd: '/git', description: 'Run an explicit Git subcommand', lane: 'git' },
  { cmd: '/diff', description: 'Show the current Git diff', lane: 'git' },
  { cmd: '/db', description: 'SQLite status; sources discovers stores; select knowledge sqlite|postgres [ENV]', lane: 'data' },
  { cmd: '/agent', description: 'Send a goal to the configured local Agent Sam runtime', lane: 'agent' },
  { cmd: '/goap', description: 'Inspect and manage GOAP blackboard: /goap [status|goal|why|plan|list|new|switch|close]', lane: 'agent' },
  { cmd: '/logs', description: 'Show local Agent Sam execution events', lane: 'observability' },
  { cmd: '/deploy', description: 'Add a cloud adapter and deploy intentionally', lane: 'deploy' },
  { cmd: '/clear', description: 'Clear the terminal display', lane: 'terminal' },
  { cmd: '/help', description: 'Show the factual implemented command catalog' },
  { cmd: '/exit', description: 'Exit Agent Sam shell and return to the host terminal' },
];

export const SHELL_PHASES = [
  { id: '0-prototype', label: 'Visual prototype + demo scenarios', status: 'complete' },
  { id: 'pty-connection', label: 'Local PTY via agentsam start-local', status: 'complete' },
  { id: 'model-context-controls', label: 'Model, reasoning, processing, and context economics', status: 'complete' },
  { id: 'run-telemetry', label: 'Provider usage, cost, resumable sessions, and permission receipts', status: 'current' },
  { id: 'dashboard-embed', label: 'Embeddable shell for IAM dashboard', status: 'planned' },
];

export function listSlashCommands(opts = {}) {
  const lane = opts.lane ? String(opts.lane).trim().toLowerCase() : '';
  if (!lane) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((row) => !row.lane || row.lane === lane);
}
