/**
 * Detect runtime credentials before init — VM metadata, gcloud, gh, wrangler, IAM env.
 * Print what's available; only prompt for what's missing.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { coreBaseUrl } from './core-client.js';

const execFileAsync = promisify(execFile);

const METADATA_BASE = 'http://metadata.google.internal/computeMetadata/v1';
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' };

async function tryExec(cmd, args, timeoutMs = 4000) {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      env: process.env,
      maxBuffer: 512 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function fetchMetadata(path, timeoutMs = 500) {
  try {
    const res = await fetch(`${METADATA_BASE}${path}`, {
      headers: METADATA_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.text()).trim() || null;
  } catch {
    return null;
  }
}

async function detectGcpVm() {
  const tokenPath =
    '/instance/service-accounts/default/token?scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform';
  const tokenRes = await fetchMetadata(tokenPath);
  if (!tokenRes) return null;

  let email = await fetchMetadata('/instance/service-accounts/default/email');
  if (!email) email = await fetchMetadata('/instance/service-accounts/default/');

  const projectId = await fetchMetadata('/project/project-id');
  const userClaim = (process.env.USER_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const claimedMatch = userClaim && projectId && userClaim === projectId;

  let parsed = null;
  try {
    parsed = JSON.parse(tokenRes);
  } catch {
    /* ignore */
  }

  return {
    source: 'vm-metadata',
    email: email || null,
    project_id: projectId || null,
    scope: claimedMatch ? 'user-claimed' : 'unverified',
    note: claimedMatch
      ? 'USER_GCP_PROJECT matches VM metadata'
      : 'VM metadata alone does not prove this is YOUR project — confirm or run gcloud auth login --no-browser',
  };
}

async function detectGcloud() {
  const configuredProject = await tryExec('gcloud', ['config', 'get-value', 'project']);
  const userClaim = (process.env.USER_GCP_PROJECT || '').trim();
  const account = await tryExec('gcloud', ['config', 'get-value', 'account']);

  const adc = await tryExec('gcloud', ['auth', 'application-default', 'print-access-token']);
  if (adc) {
    return {
      source: 'application-default',
      account: account || null,
      project_id: configuredProject || null,
      scope: userClaim && configuredProject === userClaim ? 'user-claimed' : 'local',
    };
  }

  const token = await tryExec('gcloud', ['auth', 'print-access-token']);
  if (!token) return null;
  return {
    source: 'gcloud',
    account: account || null,
    project_id: configuredProject || null,
    scope: 'local',
  };
}

async function detectGithub() {
  const envTok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT;
  if (envTok && String(envTok).trim()) {
    return { source: 'env', account: 'GITHUB_TOKEN/GH_TOKEN set' };
  }

  const status = await tryExec('gh', ['auth', 'status']);
  if (!status) return null;

  const loggedIn =
    /logged in/i.test(status) ||
    /Logged in to/i.test(status) ||
    status.includes('✓');
  if (!loggedIn) return null;

  const accountMatch =
    status.match(/account\s+(\S+)/i) ||
    status.match(/Logged in to github\.com as (\S+)/i);
  return {
    source: 'gh-cli',
    account: accountMatch?.[1] || null,
  };
}

async function detectCloudflare() {
  const envTok = process.env.CLOUDFLARE_API_TOKEN;
  if (envTok && String(envTok).trim()) {
    const acct = process.env.CLOUDFLARE_ACCOUNT_ID || null;
    return {
      source: 'env',
      account: acct ? `account ${acct}` : 'CLOUDFLARE_API_TOKEN set',
    };
  }

  const jsonOut = await tryExec('wrangler', ['whoami', '--json']);
  if (jsonOut) {
    try {
      const data = JSON.parse(jsonOut);
      const email = data?.email || data?.user?.email || null;
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      const acctLabel =
        accounts.length === 1
          ? accounts[0]?.name || accounts[0]?.id
          : accounts.length > 1
            ? `${accounts.length} accounts`
            : null;
      return {
        source: 'wrangler',
        account: email || acctLabel || 'logged in',
      };
    } catch {
      /* fall through */
    }
  }

  const textOut = await tryExec('wrangler', ['whoami']);
  if (!textOut) return null;
  if (
    !/logged in/i.test(textOut) &&
    !/You are logged in/i.test(textOut) &&
    !/Account ID/i.test(textOut)
  ) {
    return null;
  }

  const emailMatch = textOut.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const acctMatch = textOut.match(/Account ID[:\s]+([a-f0-9]{32})/i);
  return {
    source: 'wrangler',
    account: emailMatch?.[0] || (acctMatch ? `account ${acctMatch[1]}` : 'logged in'),
  };
}

async function probeSdkBearer(token) {
  const t = String(token || '').trim();
  if (!t || !t.startsWith('sdk_')) {
    return { valid: false, error: 'not_sdk_bearer' };
  }
  try {
    const res = await fetch(`${coreBaseUrl()}/api/sdk/context`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { valid: false, error: data?.error || `HTTP ${res.status}` };
    }
    return {
      valid: true,
      user_id: data.user_id || null,
      workspace_id: data.workspace_id || null,
      cloudflare_connected: data?.cloudflare?.ok === true,
    };
  } catch (e) {
    return { valid: false, error: e?.message || String(e) };
  }
}

function envPresent(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== '';
}

/** IAM auth for SDK init — only verified sdk_* bearer counts as ready. */
async function detectIam(explicitToken = '') {
  const aux = [];

  if (envPresent('AGENTSAM_BRIDGE_KEY')) {
    aux.push({
      var: 'AGENTSAM_BRIDGE_KEY',
      role: 'platform bridge (X-Bridge-Key)',
      sdk_auth: false,
      note: 'ExecOS/MCP worker trust — not CLI IAM auth',
    });
  }

  const workerKey = envPresent('IAM_API_KEY') || envPresent('AGENTSAM_API_KEY');
  if (workerKey) {
    const name = envPresent('IAM_API_KEY') ? 'IAM_API_KEY' : 'AGENTSAM_API_KEY';
    aux.push({
      var: name,
      role: 'Worker runtime secret',
      sdk_auth: false,
      note: 'wrangler secret on YOUR Worker — not CORE SDK bearer',
    });
  }

  const sdkToken = explicitToken || process.env.AGENTSAM_SDK_TOKEN || '';
  if (sdkToken.trim()) {
    const probe = await probeSdkBearer(sdkToken);
    if (probe.valid) {
      return {
        source: 'sdk-token',
        ready: true,
        detail: `AGENTSAM_SDK_TOKEN · user ${probe.user_id || '?'}`,
        probe,
        aux,
      };
    }
    return {
      source: 'sdk-token',
      ready: false,
      detail: `AGENTSAM_SDK_TOKEN invalid (${probe.error}) → will open browser`,
      probe,
      aux,
    };
  }

  const ptyUser = process.env.IAM_PTY_USER_ID || '';
  if (ptyUser.trim()) {
    return {
      source: 'execos-env',
      ready: false,
      detail: `IAM_PTY_USER_ID set (ExecOS identity — SDK bearer still needed)`,
      aux,
    };
  }

  if (aux.length) {
    return {
      source: null,
      ready: false,
      detail: 'not found → will open browser',
      aux,
    };
  }

  return { source: null, ready: false, detail: 'not found → will open browser', aux: [] };
}

/**
 * @returns {Promise<{
 *   iam: ReturnType<typeof detectIam>,
 *   gcp: Awaited<ReturnType<typeof detectGcpVm>> | Awaited<ReturnType<typeof detectGcloud>> | null,
 *   gcp_vm: boolean,
 *   github: Awaited<ReturnType<typeof detectGithub>>,
 *   cloudflare: Awaited<ReturnType<typeof detectCloudflare>>,
 * }>}
 */
export async function detectContext(opts = {}) {
  const [gcpVm, gcloud, github, cloudflare] = await Promise.all([
    detectGcpVm(),
    detectGcloud(),
    detectGithub(),
    detectCloudflare(),
  ]);

  const iam = await detectIam(opts.token || '');
  const gcp = gcpVm || gcloud;

  return {
    iam,
    gcp,
    gcp_vm: Boolean(gcpVm),
    github,
    cloudflare,
  };
}

function formatCell(label, slot, width = 10) {
  const status = slot ? slot.source || 'yes' : 'not found';
  const detail = slot?.account || slot?.email || slot?.project_id || slot?.detail || '';
  const line = `${label.padEnd(8)} ${String(status).padEnd(width)}`;
  return detail ? `${line} (${detail})` : line;
}

/** @param {Awaited<ReturnType<typeof detectContext>>} ctx */
export function printContextSummary(ctx) {
  console.log('\n  Detected credentials (informational — local init needs none):\n');
  if (ctx.iam.ready) {
    console.log(`  ${formatCell('IAM', { source: ctx.iam.source, account: ctx.iam.detail })}`);
  } else {
    console.log(`  ${'IAM'.padEnd(8)} not found  (${ctx.iam.detail || 'will open browser'})`);
  }
  console.log(`  ${formatCell('GCP', ctx.gcp)}`);
  if (ctx.gcp?.scope === 'unverified') {
    console.log(
      `  ${''.padEnd(8)} ⚠ VM project ${ctx.gcp.project_id || '?'} — not assumed yours (set USER_GCP_PROJECT to confirm)`,
    );
  }
  console.log(`  ${formatCell('GitHub', ctx.github)}`);
  console.log(`  ${formatCell('CF', ctx.cloudflare)}`);
  if (ctx.cloudflare && !ctx.iam.ready) {
    console.log('\n  Note: local wrangler/CF token helps on this machine; scaffold still uses IAM Cloudflare OAuth.');
  }
  if (ctx.gcp_vm && ctx.gcp?.scope === 'unverified') {
    console.log(
      '\n  GCP VM metadata detected — this may be a shared platform VM, not YOUR Google Cloud project.',
    );
    console.log('  Connect yours: gcloud auth login --no-browser && gcloud config set project YOUR_PROJECT_ID');
  } else if (ctx.gcp_vm && ctx.gcp?.scope === 'user-claimed') {
    console.log('\n  GCP VM verified as your project via USER_GCP_PROJECT.');
  }
  if (Array.isArray(ctx.iam.aux) && ctx.iam.aux.length) {
    console.log('\n  Other env (not SDK IAM auth):');
    for (const row of ctx.iam.aux) {
      console.log(`    ${row.var.padEnd(22)} ${row.note}`);
    }
  }
  console.log('');
}

/** @param {Awaited<ReturnType<typeof detectContext>>} ctx @param {string} [presetToken] @param {{ runTarget?: string }} [opts] */
export function missingForInit(ctx, presetToken = '', opts = {}) {
  const runTarget = opts.runTarget || 'local';
  if (runTarget === 'local') return [];
  const missing = [];
  if (!ctx.iam.ready) missing.push('iam');
  return missing;
}
