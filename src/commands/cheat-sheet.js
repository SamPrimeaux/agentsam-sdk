/**
 * Canonical Agent Sam cheat-sheet — gcloud-like command groups.
 * Old top-level commands remain as compatibility aliases.
 * Every row shows a copy-pasteable `agentsam …` invocation.
 */

const GROUPS = Object.freeze([
  {
    id: 'work',
    label: 'Work',
    commands: [
      ['project / create', 'Scaffold or enter a project'],
      ['work / goap', 'Goals, blackboard, plans'],
      ['brand / plan', 'Brand intelligence and composable plans'],
      ['artifacts', 'Receipts and deploy evidence'],
    ],
  },
  {
    id: 'repository',
    label: 'Repository',
    commands: [
      ['inspect', 'Bounded repository authority view'],
      ['machine', 'Deterministic local perception + asset discovery'],
      ['machine inspect', 'Inspect a path (file or directory)'],
      ['recon', 'Bounded-worker finding packets'],
      ['codebaseindex', 'AST ingest + optional embeddings'],
      ['index', 'Project inventory + knowledge index commands'],
      ['index status', 'Show knowledge index freshness'],
      ['search', 'Retrieve from the local knowledge index'],
      ['merkle', 'Integrity snapshots'],
      ['security', 'Dependency + trust-boundary scan'],
    ],
  },
  {
    id: 'runtime',
    label: 'Runtime',
    commands: [
      ['terminal / shell', 'Interactive slash-command shell'],
      ['connections', 'Account, terminal, Worker, Cloudflare evidence'],
      ['tunnel', 'Real Cloudflare Tunnels via Wrangler'],
      ['go', 'Go product discover/build/deploy'],
      ['dockerize', 'Supported containers'],
      ['compute', 'Google Cloud VM / IAM helpers'],
      ['gcloud auth login', 'Desktop PKCE Google Cloud connection (auto callback)'],
      ['gcloud auth login --web', 'Hosted Local Studio identity (openid/email/profile)'],
      ['gcloud auth login --sdk', 'Native Google Cloud SDK OAuth (optional)'],
      ['google-cloud', 'Projects · compute · IAM SAs · billing · doctor'],
    ],
  },
  {
    id: 'providers',
    label: 'Providers',
    commands: [
      ['setup', 'Discover → plan → approve → install (brew-style)'],
      ['providers', 'Configure / verify model + infra credentials'],
      ['models', 'Provider-verified model catalog'],
      ['cloudflare', 'Wrangler reads + Worker profiles'],
      ['google-cloud', 'Customer GCP connection inventory'],
      ['gcloud auth login', 'Desktop PKCE Google Cloud (auto callback)'],
      ['credentials audit', 'Configured · verified · drift (names only)'],
      ['plugins', 'Install and manage plugins'],
    ],
  },
  {
    id: 'data',
    label: 'Data',
    commands: [
      ['db', 'Project-local SQLite'],
      ['knowledge / search', 'Indexed retrieval'],
      ['autorag', 'AutoRAG helpers'],
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    commands: [
      ['models', 'Hosted + local model probes'],
      ['skills', 'Portable skill vocabulary'],
      ['context', 'Context economics + git bridge'],
      ['usage / session', 'Spend and resume receipts'],
    ],
  },
  {
    id: 'identity',
    label: 'Identity',
    commands: [
      ['whoami', 'Account + safe credential status'],
      ['login / logout', 'Browser OAuth session'],
      ['env', 'Vault/keychain shell loader'],
      ['api-key', 'Create/rotate aak_* keys'],
      ['identity', 'Portable OAuth portal surfaces'],
    ],
  },
  {
    id: 'apps',
    label: 'Apps',
    commands: [
      ['app / local-studio', 'Bundled Local Studio launcher'],
      ['cad', 'CAD project tools'],
      ['brand', 'Brand intelligence'],
    ],
  },
  {
    id: 'system',
    label: 'System',
    commands: [
      ['status', 'Account · models · terminal · live deploy'],
      ['doctor / credentials audit --verify', 'Auth + drift health'],
      ['update', 'Component update preview (gcloud-like)'],
      ['billing', 'Billing account relationships (not --billing-project)'],
      ['cheat-sheet', 'This page'],
      ['version', 'Print CLI version'],
    ],
  },
]);

/** Expand "a / b" rows into copy-pasteable `agentsam …` invocations. */
export function agentsamInvocations(cmd) {
  const raw = String(cmd || '').trim();
  if (!raw) return [];
  if (raw.includes(' / ')) {
    return raw.split(' / ').map((part) => `agentsam ${part.trim()}`);
  }
  return [`agentsam ${raw}`];
}

export function listCheatSheetGroups() {
  return GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    commands: group.commands.map(([cmd, summary]) => ({
      cmd,
      summary,
      invocations: agentsamInvocations(cmd),
    })),
  }));
}

export function renderCheatSheet(version) {
  const lines = [
    '',
    `  Agent Sam cheat-sheet${version ? ` · v${version}` : ''}`,
    '  Organized hierarchy · each row shows a runnable `agentsam …` command.',
    '',
  ];
  for (const group of GROUPS) {
    lines.push(`  ${group.label}`);
    for (const [cmd, summary] of group.commands) {
      const invocations = agentsamInvocations(cmd);
      const primary = invocations[0] || `agentsam ${cmd}`;
      lines.push(`    ${primary.padEnd(52)}  ${summary}`);
      for (const extra of invocations.slice(1)) {
        lines.push(`    ${extra.padEnd(52)}  (same group)`);
      }
    }
    lines.push('');
  }
  lines.push('  Failure follow-through');
  lines.push('    agentsam credentials remediate -- gcloud edge-cloud service-accounts keys create');
  lines.push('    agentsam credentials audit --verify --drift --names-only');
  lines.push('');
  lines.push('  Docs');
  lines.push('    docs/contracts/environment-vocabulary.md');
  lines.push('    docs/AUTH_IDENTITY_CONTRACT.md');
  lines.push('');
  return lines.join('\n');
}

export function runCheatSheet(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const json = argv.includes('--json');
  const version = options.version || '';
  if (json) {
    write(JSON.stringify({ schema_version: 'agentsam-cheat-sheet-v1', version, groups: listCheatSheetGroups() }, null, 2) + '\n');
    return 0;
  }
  write(renderCheatSheet(version));
  return 0;
}
