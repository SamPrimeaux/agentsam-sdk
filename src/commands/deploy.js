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

function writeCloudflareAdapter(cwd, config, cf) {
  const workerName = cf.worker_name || config.project;
  const adapterPath = path.join(cwd, 'src', 'cloudflare-worker.js');
  const migrationDir = path.join(cwd, 'migrations');
  const migrationPath = path.join(migrationDir, '0001_agentsam_core.sql');
  const localSchemaPath = path.join(cwd, config.db_schema || 'db/schema.sql');
  const tomlPath = path.join(cwd, 'wrangler.toml');

  fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
  fs.mkdirSync(migrationDir, { recursive: true });

  fs.writeFileSync(
    adapterPath,
    `import { createAgent } from './agent.js';\n\nexport default {\n  async fetch(request, env) {\n    const app = createAgent({\n      env,\n      project: ${JSON.stringify(config.project)},\n      lane: ${JSON.stringify(config.lane)},\n      agent: ${JSON.stringify(config.agent)},\n    });\n    return app.handle(request);\n  },\n};\n`,
    'utf8',
  );

  if (fs.existsSync(localSchemaPath)) {
    fs.copyFileSync(localSchemaPath, migrationPath);
  }

  const lines = [
    `name = ${JSON.stringify(workerName)}`,
    'main = "src/cloudflare-worker.js"',
    'compatibility_date = "2026-08-31"',
    'compatibility_flags = ["nodejs_compat"]',
  ];
  if (cf.account_id) lines.push(`account_id = ${JSON.stringify(cf.account_id)}`);
  if (cf.d1_database_id) {
    lines.push('', '[[d1_databases]]');
    lines.push('binding = "DB"');
    lines.push(`database_name = ${JSON.stringify(cf.d1_database_name || `${config.project}-db`)}`);
    lines.push(`database_id = ${JSON.stringify(cf.d1_database_id)}`);
  }
  if (cf.kv_namespace_id) {
    lines.push('', '[[kv_namespaces]]');
    lines.push('binding = "KV"');
    lines.push(`id = ${JSON.stringify(cf.kv_namespace_id)}`);
  }
  fs.writeFileSync(tomlPath, `${lines.join('\n')}\n`, 'utf8');

  return { adapterPath, migrationPath, tomlPath };
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
