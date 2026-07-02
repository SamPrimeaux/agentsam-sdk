/**
 * Graduate local project to Cloudflare (or GCP hints) — OAuth only here, not at init.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { authenticateViaBrowser } from '../lib/auth.js';
import { getJson, streamScaffold } from '../lib/core-client.js';

function readConfig(cwd) {
  const configPath = path.join(cwd, '.agentsam', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Not an Agent Sam project — run agentsam init first.');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(cwd, config) {
  const configPath = path.join(cwd, '.agentsam', 'config.json');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function patchWranglerToml(cwd, cf) {
  const tomlPath = path.join(cwd, 'wrangler.toml');
  if (!fs.existsSync(tomlPath)) return;
  let text = fs.readFileSync(tomlPath, 'utf8');
  if (cf.account_id) {
    if (/^account_id\s*=/m.test(text)) {
      text = text.replace(/^account_id\s*=.*$/m, `account_id = "${cf.account_id}"`);
    } else {
      text = text.replace(/(compatibility_date\s*=.*\n)/, `$1account_id = "${cf.account_id}"\n`);
    }
  }
  if (cf.d1_database_id) {
    text = text.replace(/^database_id\s*=.*$/m, `database_id = "${cf.d1_database_id}"`);
  }
  if (cf.kv_namespace_id) {
    text = text.replace(/^id\s*=.*$/m, `id = "${cf.kv_namespace_id}"`);
  }
  fs.writeFileSync(tomlPath, text, 'utf8');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runCloudflareDeploy(cwd, config, accountId) {
  console.log('\n  Cloudflare deploy — browser sign-in + resource provisioning…\n');

  let token = process.env.AGENTSAM_SDK_TOKEN || '';
  if (!token) {
    const session = await authenticateViaBrowser();
    token = session.access_token;
    console.log(`\n  ✓ Signed in (${session.user_id})\n`);
  }

  const ctx = await getJson('/api/sdk/context', token);
  if (!ctx?.cloudflare?.ok) {
    throw new Error('Connect Cloudflare in IAM Integrations during browser sign-in, then retry.');
  }

  let complete = null;
  await streamScaffold(
    {
      project_name: config.project,
      lane: config.lane,
      hosting: 'cloudflare',
      provision_only: true,
      account_id: accountId || undefined,
      workspace_id: ctx.workspace_id,
    },
    token,
    async (evt) => {
      if (evt.type === 'log') console.log(`  · ${evt.message}`);
      else if (evt.type === 'warn') console.log(`  ⚠ ${evt.message}`);
      else if (evt.type === 'account_selection_required') {
        console.log('\n  Multiple Cloudflare accounts — re-run with: agentsam deploy --account-id <id>\n');
        for (const a of evt.accounts || []) console.log(`    ${a.id}  ${a.name || ''}`);
        throw new Error('cloudflare_account_selection_required');
      } else if (evt.type === 'error') throw new Error(evt.error || 'deploy failed');
      else if (evt.type === 'complete') complete = evt;
    },
  );

  if (!complete?.cloudflare) throw new Error('deploy incomplete — no cloudflare ids returned');

  patchWranglerToml(cwd, complete.cloudflare);
  writeConfig(cwd, {
    ...config,
    deploy_target: 'cloudflare',
    cloudflare: complete.cloudflare,
    deployed_at: new Date().toISOString(),
  });

  console.log(`
  ✓ Cloudflare resources provisioned in YOUR account
  ✓ wrangler.toml updated

  Next:
    npx wrangler deploy
    npm run db:migrate -- --remote   # when ready for remote D1
  `);
}

/**
 * @param {{ cwd?: string, target?: string, accountId?: string }} [opts]
 */
export async function runDeploy(opts = {}) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const config = readConfig(cwd);

  let target = opts.target || config.deploy_target || 'cloudflare';
  if (!opts.target && !config.deploy_target) {
    console.log(`
  Where do you want to deploy?

    1) Cloudflare (Workers, D1, R2)
    2) GCP (your Google Cloud project — manual wrangler/container step after)
  `);
    const pick = (await ask('  Select [1]: ')).trim() || '1';
    target = pick === '2' ? 'gcp' : 'cloudflare';
  }

  if (target === 'gcp') {
    console.log(`
  GCP deploy path:

    gcloud auth login --no-browser
    gcloud config set project YOUR_PROJECT_ID
    export USER_GCP_PROJECT=YOUR_PROJECT_ID

  Your local project keeps running with npm run dev.
  Container/Worker deploy scripts are project-specific — add when ready.
  `);
    writeConfig(cwd, { ...config, deploy_target: 'gcp' });
    return;
  }

  await runCloudflareDeploy(cwd, config, opts.accountId || '');
}
