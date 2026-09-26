/**
 * Safe credentials / auth inventory — names, health, drift. Never returns secret values.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listProviderCredentialStatus, PROVIDER_CREDENTIALS } from './provider-credentials.js';
import { resolveAccountApiKey } from './account-session.js';
import {
  remediateGithubTokenShadow,
  remediateProviderFailure,
} from './provider-command-remediation.js';

const execFileAsync = promisify(execFile);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function homeDirectory(options = {}) {
  return path.resolve(
    clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir(),
  );
}

async function tryExec(cmd, args, { env, timeoutMs = 8000, stripGithubToken = false } = {}) {
  try {
    const childEnv = { ...env };
    if (stripGithubToken) {
      delete childEnv.GITHUB_TOKEN;
      delete childEnv.GH_TOKEN;
      delete childEnv.GITHUB_PAT;
    }
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      env: childEnv,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || '').trim(),
      stderr: String(error?.stderr || error?.message || '').trim(),
      code: error?.code ?? null,
    };
  }
}

function presence(env, name) {
  return Boolean(clean(env?.[name]));
}

function envdVarNames(home) {
  const dir = path.join(home, '.agentsam', 'env.d');
  /** @type {Record<string, string[]>} */
  const byFile = {};
  if (!fs.existsSync(dir)) return byFile;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.env')) continue;
    const full = path.join(dir, name);
    try {
      const text = fs.readFileSync(full, 'utf8');
      const vars = [];
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
        if (match) vars.push(match[1]);
      }
      byFile[name] = vars.sort();
    } catch {
      byFile[name] = [];
    }
  }
  return byFile;
}

async function auditGithub({ env, verify, noNetwork }) {
  const envTokenPresent = presence(env, 'GITHUB_TOKEN') || presence(env, 'GH_TOKEN') || presence(env, 'GITHUB_PAT');
  const row = {
    provider: 'github',
    configured: false,
    mechanisms: [],
    drift: [],
    verified: null,
    scopes: [],
    account: null,
    remediation: null,
  };

  if (envTokenPresent) {
    row.mechanisms.push({ type: 'env_token', vars: ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT'].filter((n) => presence(env, n)) });
    row.configured = true;
  }

  if (noNetwork || !verify) {
    if (envTokenPresent) {
      row.drift.push({
        code: 'env_token_may_shadow_keyring',
        severity: 'medium',
        message: 'GITHUB_TOKEN/GH_TOKEN is set; gh prefers it over macOS keyring OAuth.',
      });
    }
    return row;
  }

  const withEnv = await tryExec('gh', ['auth', 'status'], { env });
  const withoutEnv = await tryExec('gh', ['auth', 'status'], { env, stripGithubToken: true });

  const envHealthy = withEnv.ok && /Logged in to github\.com/i.test(`${withEnv.stdout}\n${withEnv.stderr}`) && !/token in GITHUB_TOKEN is invalid/i.test(`${withEnv.stdout}\n${withEnv.stderr}`);
  const keyringHealthy =
    withoutEnv.ok &&
    /Logged in to github\.com/i.test(`${withoutEnv.stdout}\n${withoutEnv.stderr}`) &&
    /keyring/i.test(`${withoutEnv.stdout}\n${withoutEnv.stderr}`);

  if (keyringHealthy) {
    row.mechanisms.push({ type: 'keyring_oauth', vars: [] });
    row.configured = true;
    const scopeMatch = `${withoutEnv.stdout}\n${withoutEnv.stderr}`.match(/Token scopes:\s*'([^']+)'/i)
      || `${withoutEnv.stdout}\n${withoutEnv.stderr}`.match(/Token scopes:\s*([^\n]+)/i);
    if (scopeMatch) {
      row.scopes = scopeMatch[1].split(/',\s*'|,\s*/).map((s) => s.replace(/'/g, '').trim()).filter(Boolean);
    }
    const acct = `${withoutEnv.stdout}\n${withoutEnv.stderr}`.match(/Logged in to github\.com account (\S+)/i);
    if (acct) row.account = acct[1];
  }

  if (envTokenPresent && !envHealthy && keyringHealthy) {
    row.drift.push({
      code: 'stale_env_token_shadows_keyring',
      severity: 'high',
      message: 'GITHUB_TOKEN is invalid and shadows a healthy keyring OAuth session.',
    });
    row.verified = false;
    row.remediation = remediateGithubTokenShadow({
      envTokenPresent: true,
      keyringHealthy: true,
      scopes: row.scopes,
    });
  } else if (envTokenPresent && envHealthy) {
    row.verified = true;
  } else if (keyringHealthy) {
    row.verified = true;
  } else if (envTokenPresent) {
    row.verified = false;
    row.drift.push({
      code: 'env_token_invalid',
      severity: 'high',
      message: 'GITHUB_TOKEN/GH_TOKEN appears configured but gh auth status failed.',
    });
  }

  if (verify && keyringHealthy) {
    const user = await tryExec('gh', ['api', 'user', '--jq', '{login:.login,type:.type}'], {
      env,
      stripGithubToken: envTokenPresent && !envHealthy,
    });
    if (user.ok) {
      try {
        const parsed = JSON.parse(user.stdout);
        row.account = parsed.login || row.account;
      } catch {
        /* ignore */
      }
    }
  }

  return row;
}

async function auditGcloud({ env, verify, noNetwork }) {
  const row = {
    provider: 'google_cloud',
    configured: false,
    mechanisms: [],
    drift: [],
    verified: null,
    project_id: null,
    region: null,
    zone: null,
    projects_visible: null,
    instances_visible: null,
  };

  if (noNetwork && !verify) {
    row.mechanisms.push({ type: 'gcloud_cli_expected', vars: [] });
    return row;
  }

  const auth = await tryExec('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], { env });
  if (auth.ok && auth.stdout) {
    row.configured = true;
    row.mechanisms.push({ type: 'gcloud_user_session', vars: [] });
    row.verified = true;
    // Do not store the account email in names-only mode callers can strip; keep for verify.
    row.account_configured = true;
  }

  const project = await tryExec('gcloud', ['config', 'get-value', 'project'], { env });
  if (project.ok && project.stdout && project.stdout !== '(unset)') {
    row.project_id = project.stdout;
  }
  const region = await tryExec('gcloud', ['config', 'get-value', 'compute/region'], { env });
  if (region.ok && region.stdout && region.stdout !== '(unset)') row.region = region.stdout;
  const zone = await tryExec('gcloud', ['config', 'get-value', 'compute/zone'], { env });
  if (zone.ok && zone.stdout && zone.stdout !== '(unset)') row.zone = zone.stdout;

  if (verify && !noNetwork && row.project_id) {
    const projects = await tryExec('gcloud', ['projects', 'list', '--format=value(projectId)'], { env, timeoutMs: 20000 });
    if (projects.ok) {
      row.projects_visible = projects.stdout.split('\n').filter(Boolean).length;
    }
    const instances = await tryExec(
      'gcloud',
      ['compute', 'instances', 'list', '--project', row.project_id, '--format=value(name)'],
      { env, timeoutMs: 20000 },
    );
    if (instances.ok) {
      row.instances_visible = instances.stdout.split('\n').filter(Boolean).length;
    } else if (/PERMISSION_DENIED/i.test(instances.stderr)) {
      row.verified = false;
      row.drift.push({
        code: 'compute_permission_denied',
        severity: 'high',
        message: 'compute.instances.list denied for active project.',
      });
      row.remediation = remediateProviderFailure({
        stderr: instances.stderr,
        projectId: row.project_id,
        argv: ['gcloud', 'compute', 'instances', 'list'],
      });
    }
  }

  return row;
}

async function auditCloudflare({ env, verify, noNetwork, providers }) {
  const status = providers.find((p) => p.provider === 'cloudflare') || {};
  const row = {
    provider: 'cloudflare',
    configured: Boolean(status.configured),
    source: status.source || null,
    env_var: 'CLOUDFLARE_API_TOKEN',
    account_id: status.account_id || null,
    verified: null,
    auth_type: null,
    mechanisms: status.configured
      ? [{ type: status.source === 'environment' ? 'api_token_env' : status.source || 'configured', vars: ['CLOUDFLARE_API_TOKEN'] }]
      : [],
    drift: [],
  };

  if (!verify || noNetwork || !row.configured) return row;

  const whoami = await tryExec('npx', ['wrangler', 'whoami'], { env, timeoutMs: 20000 });
  if (whoami.ok || /logged in/i.test(`${whoami.stdout}\n${whoami.stderr}`)) {
    row.verified = true;
    if (/Account API Token/i.test(`${whoami.stdout}\n${whoami.stderr}`)) row.auth_type = 'account_api_token';
    else if (/OAuth/i.test(`${whoami.stdout}\n${whoami.stderr}`)) row.auth_type = 'oauth';
  } else {
    row.verified = false;
    row.drift.push({ code: 'wrangler_whoami_failed', severity: 'high', message: 'wrangler whoami did not confirm login.' });
  }
  return row;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   home?: string,
 *   verify?: boolean,
 *   drift?: boolean,
 *   namesOnly?: boolean,
 *   noNetwork?: boolean,
 * }} [options]
 */
export async function collectCredentialsAudit(options = {}) {
  const env = options.env || process.env;
  const home = homeDirectory({ env, home: options.home });
  const verify = options.verify === true;
  const drift = options.drift !== false;
  const namesOnly = options.namesOnly === true;
  // Network probes only when --verify is set (unless --no-network forces offline).
  const noNetwork = options.noNetwork === true || !verify;

  const providers = listProviderCredentialStatus({ env, home });
  const apiKey = resolveAccountApiKey({ env, home });

  const shellPresence = {
    AGENTSAM_API_KEY: presence(env, 'AGENTSAM_API_KEY'),
    AGENTSAM_BRIDGE_KEY: presence(env, 'AGENTSAM_BRIDGE_KEY'),
    CLOUDFLARE_API_TOKEN: presence(env, 'CLOUDFLARE_API_TOKEN'),
    CLOUDFLARE_ACCOUNT_ID: presence(env, 'CLOUDFLARE_ACCOUNT_ID'),
    GITHUB_TOKEN: presence(env, 'GITHUB_TOKEN'),
    GH_TOKEN: presence(env, 'GH_TOKEN'),
    OPENAI_API_KEY: presence(env, 'OPENAI_API_KEY'),
    ANTHROPIC_API_KEY: presence(env, 'ANTHROPIC_API_KEY'),
    GEMINI_API_KEY: presence(env, 'GEMINI_API_KEY'),
    CURSOR_API_KEY: presence(env, 'CURSOR_API_KEY'),
    IAM_CLIENT_ID: presence(env, 'IAM_CLIENT_ID'),
    IAM_CLIENT_SECRET: presence(env, 'IAM_CLIENT_SECRET'),
    IAM_OAUTH_ISSUER: presence(env, 'IAM_OAUTH_ISSUER'),
    IAM_ORIGIN: presence(env, 'IAM_ORIGIN'),
  };

  const github = await auditGithub({ env, verify, noNetwork: noNetwork || !verify });
  const google_cloud = await auditGcloud({ env, verify, noNetwork: noNetwork || !verify });
  const cloudflare = await auditCloudflare({ env, verify, noNetwork: noNetwork || !verify, providers });

  const driftRows = [];
  if (drift) {
    if (shellPresence.IAM_ORIGIN && !shellPresence.IAM_OAUTH_ISSUER) {
      driftRows.push({
        code: 'iam_origin_without_issuer',
        severity: 'low',
        message: 'IAM_ORIGIN is set without IAM_OAUTH_ISSUER; issuer is canonical.',
      });
    }
    if (shellPresence.GITHUB_TOKEN || shellPresence.GH_TOKEN) {
      driftRows.push({
        code: 'github_env_token_present',
        severity: github.drift.some((d) => d.code === 'stale_env_token_shadows_keyring') ? 'high' : 'medium',
        message: 'Shell GitHub token variables are set; prefer keyring OAuth unless intentionally using a PAT.',
      });
    }
    for (const row of [...(github.drift || []), ...(google_cloud.drift || []), ...(cloudflare.drift || [])]) {
      driftRows.push({ ...row, provider: row.provider || undefined });
    }
  }

  const report = {
    schema_version: 'agentsam-credentials-audit-v1',
    generated_at: new Date().toISOString(),
    options: {
      verify,
      drift,
      names_only: namesOnly,
      no_network: noNetwork || !verify,
    },
    agentsam: {
      api_key_configured: Boolean(apiKey.value || apiKey.source),
      api_key_source: apiKey.source || null,
      api_key_error: apiKey.error || null,
      bridge_key_configured: shellPresence.AGENTSAM_BRIDGE_KEY,
    },
    shell_presence: shellPresence,
    env_d_variable_names: envdVarNames(home),
    provider_credentials: providers.map((row) => ({
      provider: row.provider,
      label: row.label,
      configured: row.configured,
      source: row.source,
      env: row.env,
      account_id: row.account_id || null,
      error: row.error || null,
    })),
    provider_catalog: Object.keys(PROVIDER_CREDENTIALS),
    github,
    google_cloud,
    cloudflare,
    drift: driftRows,
    remediations: [github.remediation, google_cloud.remediation].filter(Boolean),
  };

  if (namesOnly) {
    // Strip any accidental identity detail beyond names/counts.
    if (report.github) {
      report.github.account = report.github.account ? '[resolved]' : null;
    }
    if (report.google_cloud) {
      report.google_cloud.account_configured = Boolean(report.google_cloud.account_configured || report.google_cloud.configured);
      delete report.google_cloud.account;
    }
  }

  return report;
}

export function renderCredentialsAudit(report) {
  const lines = [
    '',
    '  Agent Sam · credentials audit',
    '',
    `  verify ${report.options.verify ? 'on' : 'off'} · drift ${report.options.drift ? 'on' : 'off'} · network ${report.options.no_network ? 'off' : 'on'}`,
    '',
  ];

  lines.push('  Platform');
  lines.push(`    AGENTSAM_API_KEY     ${report.agentsam.api_key_configured ? 'configured' : 'missing'}${report.agentsam.api_key_source ? ` · ${report.agentsam.api_key_source}` : ''}`);
  lines.push(`    AGENTSAM_BRIDGE_KEY  ${report.agentsam.bridge_key_configured ? 'configured' : 'missing'}`);
  lines.push('');

  lines.push('  Providers');
  for (const row of report.provider_credentials || []) {
    const mark = row.configured ? '✓' : '○';
    lines.push(`    ${mark} ${String(row.label || row.provider).padEnd(18)} ${row.configured ? (row.source || 'configured') : 'not configured'}`);
  }
  lines.push('');

  lines.push('  GitHub');
  lines.push(`    configured   ${report.github?.configured ? 'yes' : 'no'}`);
  lines.push(`    verified     ${report.github?.verified == null ? 'skipped' : report.github.verified ? 'yes' : 'no'}`);
  if (report.github?.scopes?.length) lines.push(`    scopes       ${report.github.scopes.join(', ')}`);
  if (report.github?.account && !report.options.names_only) lines.push(`    account      ${report.github.account}`);
  lines.push('');

  lines.push('  Google Cloud');
  lines.push(`    configured   ${report.google_cloud?.configured ? 'yes' : 'no'}`);
  lines.push(`    verified     ${report.google_cloud?.verified == null ? 'skipped' : report.google_cloud.verified ? 'yes' : 'no'}`);
  if (report.google_cloud?.project_id) lines.push(`    project      ${report.google_cloud.project_id}`);
  if (report.google_cloud?.projects_visible != null) lines.push(`    projects     ${report.google_cloud.projects_visible} visible`);
  if (report.google_cloud?.instances_visible != null) lines.push(`    instances    ${report.google_cloud.instances_visible} visible`);
  lines.push('');

  lines.push('  Cloudflare');
  lines.push(`    configured   ${report.cloudflare?.configured ? 'yes' : 'no'}`);
  lines.push(`    verified     ${report.cloudflare?.verified == null ? 'skipped' : report.cloudflare.verified ? 'yes' : 'no'}`);
  if (report.cloudflare?.auth_type) lines.push(`    auth type    ${report.cloudflare.auth_type}`);
  lines.push('');

  if (report.drift?.length) {
    lines.push('  Drift');
    for (const row of report.drift) {
      lines.push(`    ✕ [${row.severity || 'info'}] ${row.code} — ${row.message}`);
    }
    lines.push('');
  } else {
    lines.push('  Drift');
    lines.push('    ✓ none detected in this pass');
    lines.push('');
  }

  if (report.env_d_variable_names && Object.keys(report.env_d_variable_names).length) {
    lines.push('  ~/.agentsam/env.d (names only)');
    for (const [file, vars] of Object.entries(report.env_d_variable_names)) {
      lines.push(`    ${file}: ${(vars || []).join(', ') || '(empty)'}`);
    }
    lines.push('');
  }

  lines.push('  Next');
  lines.push('    agentsam credentials audit --verify --drift');
  lines.push('    agentsam cheat-sheet');
  lines.push('    docs: docs/contracts/environment-vocabulary.md');
  lines.push('');
  return lines.join('\n');
}
