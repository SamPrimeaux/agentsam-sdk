import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SETUP_RECEIPT_SCHEMA } from './contract.js';
import { getCapabilityRecipe } from './recipes.js';

const execFileAsync = promisify(execFile);

function homeDir(options = {}) {
  return path.resolve(options.home || options.env?.HOME || os.homedir());
}

export function setupReceiptsDir(options = {}) {
  return path.join(homeDir(options), '.agentsam', 'receipts');
}

function runStreaming(command, args, { cwd, env, write } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => {
      const text = String(buf);
      stdout += text;
      write?.(text);
    });
    child.stderr.on('data', (buf) => {
      const text = String(buf);
      stderr += text;
      write?.(text);
    });
    child.on('error', (error) => {
      resolve({ ok: false, code: 1, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Execute approved install plan steps via native providers.
 */
export async function executeSetupPlan(plan, options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const results = [];

  for (const step of plan.would_install || []) {
    write(`\n  Installing ${step.capability} via ${step.provider}\n`);
    let result;
    if (step.provider === 'homebrew') {
      if (!plan.platform || (plan.platform !== 'darwin' && plan.platform !== 'linux')) {
        result = { ok: false, error: 'homebrew_unsupported_platform' };
      } else {
        const pkgs = step.packages || [];
        // Support ["--cask", "gcloud-cli"] style.
        result = await runStreaming('brew', ['install', ...pkgs], { env, write });
      }
    } else if (step.provider === 'npm') {
      const pkgs = step.packages || [];
      result = await runStreaming('npm', ['install', '-g', ...pkgs], { env, write });
    } else if (step.provider === 'winget') {
      const pkgs = step.packages || [];
      result = await runStreaming('winget', ['install', '-e', '--id', ...pkgs], { env, write });
    } else if (step.provider === 'manual') {
      write('  Manual install required:\n');
      for (const cmd of step.commands || []) write(`    ${cmd}\n`);
      for (const note of step.notes || []) write(`    ${note}\n`);
      result = { ok: false, error: 'manual_required', notes: step.notes || [] };
    } else {
      result = { ok: false, error: `unsupported_provider:${step.provider}` };
    }

    const recipe = getCapabilityRecipe(step.capability);
    let verified = null;
    if (result.ok && recipe?.verify) {
      verified = await recipe.verify({ env });
      write(verified.ok
        ? `  ✓ verified ${step.capability}${verified.version ? ` · ${verified.version}` : ''}\n`
        : `  ✕ verify failed for ${step.capability}\n`);
    }

    results.push({
      capability: step.capability,
      provider: step.provider,
      packages: step.packages || null,
      ok: Boolean(result.ok) && (verified ? verified.ok : true),
      code: result.code ?? null,
      error: result.error || null,
      verified,
    });
  }

  const receipt = {
    schema_version: SETUP_RECEIPT_SCHEMA,
    generated_at: new Date().toISOString(),
    hostname: plan.hostname,
    platform: plan.platform,
    results,
    ok: results.every((r) => r.ok) || results.length === 0,
  };

  const dir = setupReceiptsDir(options);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `setup-${stamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  receipt.path = file;
  return receipt;
}

/**
 * Read-only Google Cloud permission inventory (for setup google.cloud / doctor).
 */
export async function collectGooglePermissionInventory(options = {}) {
  const env = options.env || process.env;
  const out = {
    schema_version: 'agentsam-gcp-permission-inventory-v1',
    generated_at: new Date().toISOString(),
    auth_list: null,
    config: null,
    user_token_scopes: null,
    projects: null,
    billing_accounts: null,
    iam_roles_for_active_user: null,
    errors: [],
  };

  try {
    const { stdout } = await execFileAsync('gcloud', ['auth', 'list', '--format=json'], { env, timeout: 20000 });
    out.auth_list = JSON.parse(stdout || '[]');
  } catch (error) {
    out.errors.push(`auth_list: ${error.message}`);
  }

  try {
    const { stdout } = await execFileAsync(
      'gcloud',
      ['config', 'list', '--format=json'],
      { env, timeout: 15000 },
    );
    out.config = JSON.parse(stdout || '{}');
  } catch (error) {
    out.errors.push(`config: ${error.message}`);
  }

  try {
    const { stdout: token } = await execFileAsync('gcloud', ['auth', 'print-access-token'], { env, timeout: 15000 });
    const t = String(token || '').trim();
    if (t) {
      const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(t)}`);
      out.user_token_scopes = await info.json();
    }
  } catch (error) {
    out.errors.push(`tokeninfo: ${error.message}`);
  }

  try {
    const { stdout } = await execFileAsync('gcloud', ['projects', 'list', '--format=json'], { env, timeout: 45000 });
    out.projects = JSON.parse(stdout || '[]');
  } catch (error) {
    out.errors.push(`projects: ${error.message}`);
  }

  try {
    const { stdout } = await execFileAsync('gcloud', ['billing', 'accounts', 'list', '--format=json'], { env, timeout: 30000 });
    out.billing_accounts = JSON.parse(stdout || '[]');
  } catch (error) {
    out.errors.push(`billing: ${error.message}`);
  }

  const project = out.config?.core?.project;
  const account = out.config?.core?.account;
  if (project && account && !String(account).includes('.gserviceaccount.com')) {
    try {
      const { stdout } = await execFileAsync(
        'gcloud',
        [
          'projects', 'get-iam-policy', project,
          '--flatten=bindings[].members',
          `--filter=bindings.members:user:${account}`,
          '--format=json',
        ],
        { env, timeout: 45000 },
      );
      const rows = JSON.parse(stdout || '[]');
      out.iam_roles_for_active_user = {
        project,
        account,
        roles: [...new Set((rows || []).map((r) => r.bindings?.role).filter(Boolean))],
      };
    } catch (error) {
      out.errors.push(`iam: ${error.message}`);
    }
  }

  return out;
}
