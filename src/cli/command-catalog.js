/**
 * CLI command catalog — machine-readable authority for help, assist tips, and dispatch hints.
 * Alias ≠ authority: skill tips and SAM operation ids live here so help is not a prose-only dump.
 */

/** @typedef {{ id: string, aliases?: string[], summary: string, topic: string, skill?: string, operation?: string, common?: boolean }} CliCommandEntry */

/** @type {CliCommandEntry[]} */
export const CLI_COMMAND_CATALOG = Object.freeze([
  { id: 'help', aliases: ['-h', '--help'], summary: 'Interactive or topic help from this catalog', topic: 'start', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'create', summary: 'Scaffold a new AgentSam project from a preset', topic: 'create', skill: 'agentsam-app-fundamentals', common: false },
  { id: 'add', summary: 'Add an explicit feature/capability selection', topic: 'create', skill: 'agentsam-app-fundamentals' },
  { id: 'plugins', summary: 'Install and manage AgentSam plugins', topic: 'create', skill: 'agentsam-app-fundamentals' },
  { id: 'dev', summary: 'Run this project’s npm dev script', topic: 'work', skill: 'agentsam-app-fundamentals' },
  { id: 'inspect', summary: 'Bounded repository inspect / authority view', topic: 'work', skill: 'agentsam-app-fundamentals', operation: 'repository.inspect', common: true },
  { id: 'capabilities', summary: 'Inspect capability contracts', topic: 'create', skill: 'agentsam-app-fundamentals' },
  { id: 'skills', aliases: ['skill'], summary: 'List or load portable skill instructions', topic: 'create', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'context', summary: 'Git + bridge context from any repo', topic: 'work', skill: 'agentsam-app-fundamentals' },
  { id: 'status', summary: 'Account, models, terminal, and live deploy awareness', topic: 'runtime', skill: 'agentsam-progression-guard', common: true },
  { id: 'db', summary: 'Project-local SQLite status/init', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'models', summary: 'Probe hosted/local model availability', topic: 'start', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'providers', summary: 'Configure machine provider credentials', topic: 'start', skill: 'agentsam-app-fundamentals' },
  { id: 'credentials', aliases: ['credential'], summary: 'Audit credentials, drift, and failure remediation (never prints secrets)', topic: 'start', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'cheat-sheet', aliases: ['cheatsheet'], summary: 'Organized command groups (gcloud-like)', topic: 'start', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'env', summary: 'Provider profile / shell loader helpers', topic: 'start', skill: 'agentsam-app-fundamentals' },
  { id: 'api-key', aliases: ['apikey', 'api-keys'], summary: 'Create/list/rotate AgentSam API keys (aak_*)', topic: 'start', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'login', summary: 'Sign in and persist machine-local session', topic: 'start', skill: 'agentsam-app-fundamentals' },
  { id: 'logout', summary: 'Sign out locally', topic: 'start', skill: 'agentsam-app-fundamentals' },
  { id: 'whoami', summary: 'Authenticated account + tokenPermissions', topic: 'start', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'resume', summary: 'Resume a saved AgentSam session', topic: 'start', skill: 'agentsam-app-fundamentals' },
  { id: 'shell', summary: 'Interactive slash-command shell', topic: 'inside', skill: 'agentsam-app-fundamentals' },
  { id: 'start-local', summary: 'Local PTY WebSocket service', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'ollama', summary: 'Local Ollama setup/status/models', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'tunnel', summary: 'Cloudflare Tunnel via Wrangler', topic: 'runtime', skill: 'agentsam-cloudflare-workers' },
  { id: 'connections', aliases: ['connection'], summary: 'Inspect execution connections', topic: 'runtime', skill: 'agentsam-cloudflare-workers' },
  { id: 'compute', summary: 'Alias for google-cloud compute/iam helpers', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'google-cloud', aliases: ['gcp', 'gcloud'], summary: 'Google Cloud auth, projects, compute, IAM SAs, billing, doctor', topic: 'runtime', skill: 'agentsam-app-fundamentals', common: true },
  { id: 'billing', aliases: ['costs'], summary: 'Billing account relationships (not --billing-project)', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'update', summary: 'Component update preview (gcloud-like)', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'deploy', summary: 'Graduate intentionally to cloud', topic: 'runtime', skill: 'agentsam-progression-guard', common: true },
  { id: 'deploy-receipt', summary: 'Merkle deploy/checkpoint receipts', topic: 'runtime', skill: 'agentsam-progression-guard' },
  { id: 'cloudflare', aliases: ['cf'], summary: 'Wrangler reads + Worker CPU profiles', topic: 'runtime', skill: 'agentsam-cloudflare-workers' },
  { id: 'go', summary: 'Go product discover/build/deploy', topic: 'runtime', skill: 'agentsam-cloudflare-workers' },
  { id: 'mcp', summary: 'MCP server catalog and client adapters', topic: 'runtime', skill: 'agentsam-cloudflare-workers' },
  { id: 'eval', summary: 'Context fixtures and live eval telemetry', topic: 'runtime', skill: 'agentsam-app-fundamentals' },
  { id: 'index', summary: 'Plan/run incremental AST (+ optional embeddings)', topic: 'work', skill: 'agentsam-codebaseindex', operation: 'codebaseindex.ingest' },
  { id: 'search', summary: 'Retrieve indexed code/text', topic: 'work', skill: 'agentsam-codebaseindex' },
  { id: 'repo', summary: 'Repository snapshot / observations', topic: 'work', skill: 'agentsam-app-fundamentals', operation: 'repository.inspect' },
  { id: 'init', summary: 'Knowledge setup or local scaffold', topic: 'create', skill: 'agentsam-app-fundamentals' },
  { id: 'codebaseindex', aliases: ['ingest', 'codebase-index'], summary: 'Guided codebase ingest: materials, allowlist, embeddings, storage', topic: 'work', skill: 'agentsam-codebaseindex', operation: 'codebaseindex.ingest', common: true },
  { id: 'brand', summary: 'Deterministic brand intelligence', topic: 'work', skill: 'agentsam-app-fundamentals', operation: 'brand.scan' },
  { id: 'plan', summary: 'Composable plans (e.g. brand)', topic: 'work', skill: 'agentsam-app-fundamentals' },
  { id: 'security', aliases: ['sca'], summary: 'Dependency + trust-boundary scan', topic: 'work', skill: 'agentsam-progression-guard', operation: 'security.scan', common: true },
  { id: 'merkle', summary: 'File integrity snapshots and explorer', topic: 'work', skill: 'agentsam-app-fundamentals' },
  { id: 'cad', summary: 'Blender/OpenSCAD/FreeCAD CAD tools', topic: 'work', skill: 'agentsam-app-fundamentals', operation: 'cad.blender.inspect' },
  { id: 'dockerize', summary: 'Build/run supported containers', topic: 'create', skill: 'agentsam-app-fundamentals' },
  { id: 'mini', summary: 'Create a small local gadget', topic: 'create', skill: 'agentsam-jr-dev' },
  { id: 'recon', summary: 'Bounded-worker packets + finding reports', topic: 'work', skill: 'agentsam-app-fundamentals' },
  { id: 'autorag', summary: 'AutoRAG configure/probe helpers', topic: 'work', skill: 'agentsam-codebaseindex' },
  { id: 'identity', summary: 'Identity portal, providers, protocol surfaces', topic: 'create', skill: 'agentsam-app-fundamentals' },
  { id: 'scaffold', summary: 'Generate CMS or worker-api starter', topic: 'create', skill: 'agentsam-jr-dev' },
  { id: 'goap', summary: 'GOAP blackboard status/plan', topic: 'inside', skill: 'agentsam-app-fundamentals' },
  { id: 'app', aliases: ['apps'], summary: 'Bundled AgentSam apps launcher', topic: 'create', skill: 'agentsam-app-fundamentals' },
]);

const byId = new Map();
for (const entry of CLI_COMMAND_CATALOG) {
  byId.set(entry.id, entry);
  for (const alias of entry.aliases || []) byId.set(alias, entry);
}

/**
 * @param {string} name
 * @returns {CliCommandEntry|null}
 */
export function getCliCommand(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return byId.get(key) || null;
}

export function listCliCommands(options = {}) {
  let rows = [...CLI_COMMAND_CATALOG];
  if (options.topic) rows = rows.filter((r) => r.topic === options.topic);
  if (options.common) rows = rows.filter((r) => r.common);
  return rows;
}

/**
 * Machine baseline: every command surfaces how to load its skill from inside the CLI.
 * @param {CliCommandEntry|string} entryOrId
 * @param {{ write?: (s: string) => void, quiet?: boolean }} [options]
 */
export function printAssistTip(entryOrId, options = {}) {
  if (options.quiet) return;
  // Never contaminate machine JSON streams.
  if (options.json || process.argv.includes('--json') || process.argv.includes('--format=json')) return;
  const entry = typeof entryOrId === 'string' ? getCliCommand(entryOrId) : entryOrId;
  if (!entry?.skill) return;
  const write = options.write || ((s) => process.stderr.write(s));
  const op = entry.operation ? ` · sam.invoke("${entry.operation}")` : '';
  write(`  tip: use skill ${entry.skill}   (agentsam skills ${entry.skill})${op}\n`);
}

/**
 * Suggest close command ids for unknown input.
 * @param {string} name
 * @param {number} [limit]
 */
export function suggestCliCommands(name, limit = 5) {
  const q = String(name || '').toLowerCase();
  if (!q) return listCliCommands({ common: true }).slice(0, limit);
  return CLI_COMMAND_CATALOG
    .map((entry) => {
      const hay = [entry.id, ...(entry.aliases || []), entry.summary].join(' ').toLowerCase();
      let score = 0;
      if (entry.id.startsWith(q) || (entry.aliases || []).some((a) => a.startsWith(q))) score += 3;
      if (hay.includes(q)) score += 1;
      for (const t of q.split(/[^a-z0-9]+/).filter(Boolean)) {
        if (hay.includes(t)) score += 1;
      }
      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map((x) => x.entry);
}

export const CLI_HELP_TOPICS = Object.freeze([
  { id: 'start', label: 'Start / resume', summary: 'Enter AgentSam, resume work, identity, models.' },
  { id: 'work', label: 'Build / inspect', summary: 'Repository intelligence, ingest, security, brand.' },
  { id: 'runtime', label: 'Runtime / terminal', summary: 'Local, remote, sandbox, and deployment controls.' },
  { id: 'inside', label: 'Inside AgentSam', summary: 'Shell and GOAP surfaces.' },
  { id: 'create', label: 'Create / extend', summary: 'Scaffold, add capabilities, identity, skills.' },
]);
