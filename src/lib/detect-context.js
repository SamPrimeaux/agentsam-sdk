/**
 * Detect runtime credentials before init — VM metadata, gcloud, gh, wrangler, IAM env.
 * Print what's available; only prompt for what's missing.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

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

  let parsed = null;
  try {
    parsed = JSON.parse(tokenRes);
  } catch {
    /* ignore */
  }

  return {
    source: 'vm-metadata',
    email: email || null,
    token_type: parsed?.token_type || 'Bearer',
    expires_in: parsed?.expires_in ?? null,
  };
}

async function detectGcloud() {
  const adc = await tryExec('gcloud', ['auth', 'application-default', 'print-access-token']);
  if (adc) {
    const account = await tryExec('gcloud', ['config', 'get-value', 'account']);
    return { source: 'application-default', account: account || null };
  }

  const token = await tryExec('gcloud', ['auth', 'print-access-token']);
  if (!token) return null;
  const account = await tryExec('gcloud', ['config', 'get-value', 'account']);
  return { source: 'gcloud', account: account || null };
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

function detectIam() {
  const sdkToken = process.env.AGENTSAM_SDK_TOKEN || '';
  if (sdkToken.trim()) {
    return { source: 'sdk-token', ready: true, detail: 'AGENTSAM_SDK_TOKEN' };
  }

  const apiKey = process.env.IAM_API_KEY || process.env.AGENTSAM_API_KEY || '';
  if (apiKey.trim()) {
    return { source: 'injected', ready: true, detail: 'IAM_API_KEY' };
  }

  const ptyUser = process.env.IAM_PTY_USER_ID || '';
  if (ptyUser.trim()) {
    return {
      source: 'execos-env',
      ready: false,
      detail: `IAM_PTY_USER_ID=${ptyUser.slice(0, 12)}… (SDK bearer still needed)`,
    };
  }

  return { source: null, ready: false, detail: 'not found → will open browser' };
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
export async function detectContext() {
  const [gcpVm, gcloud, github, cloudflare] = await Promise.all([
    detectGcpVm(),
    detectGcloud(),
    detectGithub(),
    detectCloudflare(),
  ]);

  const iam = detectIam();
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
  const detail = slot?.account || slot?.email || slot?.detail || '';
  const line = `${label.padEnd(8)} ${String(status).padEnd(width)}`;
  return detail ? `${line} (${detail})` : line;
}

/** @param {Awaited<ReturnType<typeof detectContext>>} ctx */
export function printContextSummary(ctx) {
  console.log('\n  Detected credentials:\n');
  if (ctx.iam.ready) {
    console.log(`  ${formatCell('IAM', { source: ctx.iam.source, account: ctx.iam.detail })}`);
  } else {
    console.log(`  ${'IAM'.padEnd(8)} not found  (${ctx.iam.detail || 'will open browser'})`);
  }
  console.log(`  ${formatCell('GCP', ctx.gcp)}`);
  console.log(`  ${formatCell('GitHub', ctx.github)}`);
  console.log(`  ${formatCell('CF', ctx.cloudflare)}`);
  if (ctx.cloudflare && !ctx.iam.ready) {
    console.log('\n  Note: local wrangler/CF token helps on this machine; scaffold still uses IAM Cloudflare OAuth.');
  }
  if (ctx.gcp_vm) {
    console.log('\n  GCP VM metadata detected — gcloud auth available without browser login.');
  }
  console.log('');
}

/** @param {Awaited<ReturnType<typeof detectContext>>} ctx */
export function missingForInit(ctx, presetToken = '') {
  const missing = [];
  const hasIam = ctx.iam.ready || Boolean(presetToken || process.env.AGENTSAM_SDK_TOKEN);
  if (!hasIam) missing.push('iam');
  return missing;
}
