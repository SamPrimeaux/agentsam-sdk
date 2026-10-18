/**
 * Canonical Agent Sam cheat-sheet — gcloud-like command groups.
 * Old top-level commands remain as compatibility aliases.
 * Every row shows a copy-pasteable `agentsam …` invocation.
 */

const GROUPS = Object.freeze([
  {
    id: 'work',
    label: 'Work and plans',
    commands: [
      ['create', 'Scaffold a project from a preset'],
      ['add', 'Select a project feature/capability'],
      ['plan', 'Durable project-local plans and task evidence'],
      ['goap', 'GOAP blackboard and dry-run sequencing'],
      ['run', 'Inspect/control local or hosted runs'],
      ['receipts', 'Inspect operation receipts'],
      ['deploy-receipt', 'Capture content-addressed deployment evidence'],
    ],
  },
  {
    id: 'repository',
    label: 'Repository and intelligence',
    commands: [
      ['inspect', 'Certified bounded repository snapshot'],
      ['machine inspect', 'Native deterministic path inspection'],
      ['machine crawl', 'Normalize repository Machine evidence'],
      ['machine mine', 'Evidence-backed implementation reuse candidates'],
      ['brand scan', 'Extract observed brand tokens, colors, components and assets'],
      ['brand resolve', 'Resolve brand roles and confidence'],
      ['brand plan', 'Propose coherence and migration steps'],
      ['recon', 'Bounded worker evidence packets'],
      ['codebaseindex', 'Structural ingest and optional embeddings'],
      ['index status', 'Inspect knowledge generation freshness'],
      ['search', 'Search published local knowledge'],
      ['merkle', 'Content-addressed integrity snapshots'],
      ['security', 'Dependency and execution trust-boundary scan'],
    ],
  },
  {
    id: 'capabilities',
    label: 'Capability registry',
    commands: [
      ['capabilities', 'List protocol capability declarations'],
      ['capabilities --inventory --json', 'Joined registry (commands, packages, capabilities)'],
      ['capabilities --inventory --commands --search machine', 'Find actual CLI commands'],
      ['capabilities --inventory --packages --search workbench', 'Find reusable packages'],
      ['explain capability workspace.write', 'Inspect effects and requirements (not readiness proof)'],
      ['explain command machine', 'Explain a CLI command'],
    ],
  },
  {
    id: 'runtime',
    label: 'Runtime and machines',
    commands: [
      ['setup runtime --list', 'Available runtime goal profiles'],
      ['setup runtime --dry-run', 'Constraint/GOAP plan, without adapter installation'],
      ['runtime', 'Manage real local agentsamd runtime'],
      ['runtime doctor --json', 'Check runtime health'],
      ['terminal', 'Terminal identity, enrollment and sessions'],
      ['shell', 'Interactive AgentSam shell'],
      ['connections', 'Registered provider and terminal connection evidence'],
      ['tunnel', 'Cloudflare Tunnel operations via Wrangler'],
      ['compute', 'Customer Google Cloud compute helpers'],
      ['google-cloud', 'Customer GCP resources and connection inventory'],
      ['dockerize', 'Supported container workflows'],
    ],
  },
  {
    id: 'providers',
    label: 'Toolchain and providers',
    commands: [
      ['setup --list', 'List native package setup recipes'],
      ['setup --dry-run', 'Explain native provider mutations before approval'],
      ['setup google.cloud --inventory', 'Read-only gcloud project/IAM/billing inventory'],
      ['providers', 'Configure/verify external model and infrastructure credentials'],
      ['models', 'Provider-verified model catalog'],
      ['cloudflare', 'Explicit Wrangler/provider operations'],
      ['credentials audit', 'Name-only credential inventory and drift'],
      ['plugins', 'Account/plugin management'],
      ['plugin', 'Inspect or verify governed plugin products'],
    ],
  },
  {
    id: 'data',
    label: 'Data and knowledge',
    commands: [
      ['db', 'Project-local SQLite (not remote Cloudflare D1)'],
      ['index', 'Incremental knowledge index'],
      ['search', 'Bounded indexed retrieval'],
      ['autorag', 'AutoRAG discovery/configuration helpers'],
    ],
  },
  {
    id: 'ai',
    label: 'Model and workflow machinery',
    commands: [
      ['models', 'Model discovery and availability'],
      ['hooks', 'Lifecycle sources, dispatch order and receipts'],
      ['skills', 'Portable reusable skill vocabulary'],
      ['context', 'Context economics and Git bridge'],
      ['eval', 'Evaluation fixtures and telemetry'],
      ['ollama', 'Local model/runtime helpers'],
    ],
  },
  {
    id: 'identity',
    label: 'Identity and authorization',
    commands: [
      ['whoami', 'Account identity and credential status'],
      ['login', 'Browser OAuth session'],
      ['logout', 'Clear signed-in session'],
      ['env', 'OS keychain/vault-backed environment loading'],
      ['api-key', 'Create/rotate AgentSam account keys'],
      ['identity', 'Portable OAuth application surfaces'],
    ],
  },
  {
    id: 'apps',
    label: 'Applications and packages',
    commands: [
      ['app list', 'Discover distributed APP manifests'],
      ['app inspect <id>', 'Inspect and validate an APP manifest'],
      ['app validate --all', 'Validate APP contract across the checkout'],
      ['app install <id>', 'Print distribution instructions; not a runtime install'],
      ['app preview <id>', 'Launch APP-provided preview command'],
      ['cad', 'CAD project and model workflows'],
      ['merch', 'Merchandising workflows'],
      ['brand', 'Brand workflows and outputs'],
      ['robotics', 'Robotics planning and verification primitives'],
      ['package', 'Package-related commands'],
    ],
  },
  {
    id: 'system',
    label: 'System and verification',
    commands: [
      ['status', 'Account, models, terminal and deploy state'],
      ['doctor', 'Local toolchain diagnostic and remedies'],
      ['update', 'Component update preview'],
      ['billing', 'Billing relationships (not a cost dashboard flag)'],
      ['cheat-sheet', 'This executable command guide'],
      ['explain', 'Inspect supported catalog entries'],
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
