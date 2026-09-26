/**
 * Deterministic provider-command remediation — no LLM.
 * Turns provider-native failures into next-step cards with copyable commands.
 */

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function argvLine(argv = []) {
  return argv.map((part) => (/\s/.test(String(part)) ? JSON.stringify(String(part)) : String(part))).join(' ');
}

/** @typedef {{ id: string, title: string, command?: string, recommended?: boolean, docs_url?: string }} RemediationAction */

/**
 * @typedef {object} RemediationCard
 * @property {string} schema_version
 * @property {string} provider
 * @property {string} kind
 * @property {string} title
 * @property {string} summary
 * @property {string[]} ran
 * @property {string[]} [notes]
 * @property {RemediationAction[]} actions
 * @property {{ enter?: string, h?: string, o?: string, c?: string, p?: string, esc?: string }} keys
 */

/**
 * Google Distributed Cloud Edge ≠ Compute Engine IAM.
 * Acceptance fixture from the Mac ExecOS failure.
 * @param {{ argv?: string[], projectId?: string, instance?: string, zone?: string }} [ctx]
 * @returns {RemediationCard|null}
 */
export function remediateGcloudEdgeServiceAccountKey(ctx = {}) {
  const argv = Array.isArray(ctx.argv) ? ctx.argv.map(String) : [];
  const joined = argv.join(' ').toLowerCase();
  const looksLike =
    /edge-cloud/.test(joined) &&
    /service-accounts?/.test(joined) &&
    /\bkeys?\b/.test(joined) &&
    /\bcreate\b/.test(joined);
  if (!looksLike && !ctx.force) return null;

  const projectId = clean(ctx.projectId) || clean(ctx.env?.CLOUDSDK_CORE_PROJECT) || '$PROJECT_ID';
  const instance = clean(ctx.instance) || 'iam-tunnel';
  const zone = clean(ctx.zone) || 'us-central1-f';
  const saEmail = clean(ctx.serviceAccount) || `agentsam-env-controller@${projectId === '$PROJECT_ID' ? 'PROJECT_ID' : projectId}.iam.gserviceaccount.com`;

  return Object.freeze({
    schema_version: 'agentsam-remediation-v1',
    provider: 'google_cloud',
    kind: 'command_incomplete_wrong_family',
    title: 'Command incomplete',
    summary:
      'This command belongs to Google Distributed Cloud Edge. Your current runtime is a Compute Engine VM / standard GCP project.',
    ran: Object.freeze([argvLine(argv.length ? argv : ['gcloud', 'edge-cloud', 'service-accounts', 'keys', 'create'])]),
    notes: Object.freeze([
      'edge-cloud manages GDCE resources, not project IAM service accounts.',
      'Prefer OAuth / ADC for Local Studio connections over downloadable JSON keys.',
    ]),
    actions: Object.freeze([
      Object.freeze({
        id: 'inspect_vm_sa',
        title: "Inspect the VM's current service account",
        recommended: true,
        command: `gcloud compute instances describe ${instance} --zone=${zone} --project=${projectId} --format='yaml(serviceAccounts,name,status)'`,
      }),
      Object.freeze({
        id: 'list_iam_sas',
        title: 'List normal Google IAM service accounts',
        command: `gcloud iam service-accounts list --project=${projectId} --format='table(email,displayName,disabled)'`,
      }),
      Object.freeze({
        id: 'create_iam_key',
        title: 'Create a standard service-account key (avoid when ADC works)',
        command: `gcloud iam service-accounts keys create ./sa-key.json --iam-account=${saEmail} --project=${projectId}`,
      }),
      Object.freeze({
        id: 'oauth_connection',
        title: 'Use OAuth instead (recommended for Local Studio)',
        command: 'agentsam connections',
        docs_url: 'https://cloud.google.com/docs/authentication',
      }),
    ]),
    keys: Object.freeze({
      enter: 'recommended',
      h: 'help',
      o: 'open provider docs',
      c: 'copy command',
      esc: 'cancel',
    }),
  });
}

/**
 * @param {{ operation?: string, connection?: string, projectId?: string, permission?: string }} [ctx]
 * @returns {RemediationCard}
 */
export function remediateGcloudPermissionDenied(ctx = {}) {
  const operation = clean(ctx.operation) || 'compute.instances.list';
  const connection = clean(ctx.connection) || 'Google Cloud';
  const projectId = clean(ctx.projectId) || '$PROJECT_ID';
  const permission = clean(ctx.permission) || operation;

  return Object.freeze({
    schema_version: 'agentsam-remediation-v1',
    provider: 'google_cloud',
    kind: 'permission_denied',
    title: 'Permission missing',
    summary: `Operation ${operation} was denied for the active Google Cloud connection.`,
    ran: Object.freeze([]),
    notes: Object.freeze([
      `Connection: ${connection}`,
      `Required permission (when known): ${permission}`,
    ]),
    actions: Object.freeze([
      Object.freeze({
        id: 'reauth',
        title: 'Re-authorize Google Cloud',
        recommended: true,
        command: 'gcloud auth login',
      }),
      Object.freeze({
        id: 'show_permission',
        title: 'Show required permission',
        command: `gcloud projects get-iam-policy ${projectId} --flatten='bindings[].members' --filter='bindings.role:roles/' --format='table(bindings.role)'`,
      }),
      Object.freeze({
        id: 'open_iam',
        title: 'Open IAM / consent page',
        docs_url: `https://console.cloud.google.com/iam-admin/iam?project=${encodeURIComponent(projectId)}`,
        command: `open "https://console.cloud.google.com/iam-admin/iam?project=${projectId}"`,
      }),
      Object.freeze({
        id: 'copy_probe',
        title: 'Copy read-only probe command',
        command: `gcloud compute instances list --project=${projectId} --format='table(name,zone,status,machineType)'`,
      }),
    ]),
    keys: Object.freeze({
      enter: 'Re-authorize Google Cloud',
      p: 'Show required permission',
      o: 'Open IAM/consent page',
      c: 'Copy gcloud command',
      esc: 'cancel',
    }),
  });
}

/**
 * GitHub env token shadows healthy keyring OAuth.
 * @param {{ envTokenPresent?: boolean, keyringHealthy?: boolean, scopes?: string[] }} [ctx]
 * @returns {RemediationCard|null}
 */
export function remediateGithubTokenShadow(ctx = {}) {
  if (!ctx.envTokenPresent || ctx.keyringHealthy !== true) return null;
  return Object.freeze({
    schema_version: 'agentsam-remediation-v1',
    provider: 'github',
    kind: 'credential_shadow',
    title: 'Stale GITHUB_TOKEN shadows working keyring login',
    summary:
      'macOS keyring OAuth is healthy, but GITHUB_TOKEN / GH_TOKEN in the environment takes precedence and returns HTTP 401.',
    ran: Object.freeze([]),
    notes: Object.freeze([
      ...(Array.isArray(ctx.scopes) && ctx.scopes.length
        ? [`Keyring scopes: ${ctx.scopes.join(', ')}`]
        : []),
      'Prefer GitHub App installation for customer products; developer Macs may keep gh OAuth.',
    ]),
    actions: Object.freeze([
      Object.freeze({
        id: 'unset',
        title: 'Remove stale shell override for this session',
        recommended: true,
        command: 'unset GITHUB_TOKEN GH_TOKEN',
      }),
      Object.freeze({
        id: 'status',
        title: 'Confirm keyring auth',
        command: 'gh auth status',
      }),
      Object.freeze({
        id: 'whoami',
        title: 'Confirm API identity',
        command: "gh api user --jq '{login: .login, type: .type}'",
      }),
      Object.freeze({
        id: 'find_source',
        title: 'Inspect where the override originates',
        command: "rg -n 'GITHUB_TOKEN|GH_TOKEN' ~/.zshrc ~/.zprofile ~/.profile ~/.agentsam 2>/dev/null",
      }),
    ]),
    keys: Object.freeze({
      enter: 'inspect source',
      c: 'copy command',
      esc: 'cancel',
    }),
  });
}

/**
 * Classify a failed argv / stderr blob into a remediation card when possible.
 * @param {{ argv?: string[], stderr?: string, stdout?: string, env?: NodeJS.ProcessEnv, projectId?: string }} input
 * @returns {RemediationCard|null}
 */
export function remediateProviderFailure(input = {}) {
  const argv = Array.isArray(input.argv) ? input.argv.map(String) : [];
  const text = `${argv.join(' ')}\n${clean(input.stderr)}\n${clean(input.stdout)}`;

  const edge = remediateGcloudEdgeServiceAccountKey({
    argv,
    projectId: input.projectId,
    env: input.env,
    force: /edge-cloud/.test(text) && /service-account/.test(text),
  });
  if (edge) return edge;

  if (/PERMISSION_DENIED|permission.?denied|403 Forbidden/i.test(text)) {
    const opMatch = text.match(/\b([a-z]+(?:\.[a-z]+){1,4})\b/i);
    return remediateGcloudPermissionDenied({
      operation: opMatch?.[1],
      projectId: input.projectId,
      connection: 'Google Cloud',
    });
  }

  if (/GITHUB_TOKEN|GH_TOKEN/i.test(text) && /401|invalid|Bad credentials/i.test(text)) {
    return remediateGithubTokenShadow({
      envTokenPresent: true,
      keyringHealthy: true,
    });
  }

  return null;
}

/**
 * Human-readable card (never prints secrets).
 * @param {RemediationCard} card
 * @returns {string}
 */
export function renderRemediationCard(card) {
  if (!card) return '';
  const lines = [
    '',
    `  Agent Sam · ${providerLabel(card.provider)}`,
    '',
    `  ✕ ${card.title}`,
    '',
  ];
  if (card.ran?.length) {
    lines.push('  You ran:');
    for (const ran of card.ran) lines.push(`    ${ran}`);
    lines.push('');
  }
  if (card.summary) {
    lines.push(`  ${card.summary}`);
    lines.push('');
  }
  if (card.notes?.length) {
    for (const note of card.notes) lines.push(`  ${note}`);
    lines.push('');
  }
  if (card.actions?.length) {
    lines.push('  Likely intent');
    lines.push('');
    card.actions.forEach((action, index) => {
      const mark = action.recommended ? '★' : ' ';
      lines.push(`  ${mark} ${index + 1}  ${action.title}`);
      if (action.command) lines.push(`       ${action.command}`);
      if (action.docs_url) lines.push(`       docs: ${action.docs_url}`);
      lines.push('');
    });
  }
  const keys = card.keys || {};
  const keyBits = [];
  if (keys.enter) keyBits.push(`[enter] ${keys.enter}`);
  if (keys.h) keyBits.push(`[h] ${keys.h}`);
  if (keys.p) keyBits.push(`[p] ${keys.p}`);
  if (keys.o) keyBits.push(`[o] ${keys.o}`);
  if (keys.c) keyBits.push(`[c] ${keys.c}`);
  if (keys.esc) keyBits.push(`[esc] ${keys.esc}`);
  if (keyBits.length) {
    lines.push(`  ${keyBits.join('  ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

function providerLabel(provider) {
  switch (clean(provider)) {
    case 'google_cloud':
      return 'Google Cloud';
    case 'github':
      return 'GitHub';
    case 'cloudflare':
      return 'Cloudflare';
    default:
      return clean(provider) || 'Provider';
  }
}

export function recommendedCommand(card) {
  const hit = (card?.actions || []).find((row) => row.recommended && row.command);
  return hit?.command || (card?.actions || []).find((row) => row.command)?.command || null;
}
