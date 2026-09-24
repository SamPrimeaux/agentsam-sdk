import fs from 'node:fs';
import path from 'node:path';
import { writeFileTree } from '../lib/scaffold/writer.js';
import { buildIdentityAppScaffold } from '../lib/identity-scaffold.js';
import pkg from '../../package.json' with { type: 'json' };

function parseArgs(argv) {
  const opts = {
    projectName: '',
    brandName: '',
    logoUrl: '',
    provider: 'inneranimalmedia',
    yes: false,
    cwd: process.cwd(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--name') opts.projectName = argv[++i] || '';
    else if (arg === '--brand') opts.brandName = argv[++i] || '';
    else if (arg === '--logo-url') opts.logoUrl = argv[++i] || '';
    else if (arg === '--provider') opts.provider = argv[++i] || opts.provider;
    else if (arg === '--cwd') opts.cwd = argv[++i] || opts.cwd;
  }
  return opts;
}

export async function runIdentityInit(argv = []) {
  const opts = parseArgs(argv);
  if (!opts.projectName) {
    console.error('\n  Usage: agentsam identity init --name <project> [--brand "App Name"] [--logo-url /logo.svg] [--provider inneranimalmedia|google|github|gcp|email|cloudflare]\n');
    process.exit(1);
  }

  const { getIdentityProviderTemplate, writeFeatureSelections } = await import('../lib/features-resolve.js');
  const provider = getIdentityProviderTemplate(opts.provider);
  if (!provider) {
    console.error(`\n  ✗ Unknown provider template: ${opts.provider}\n`);
    process.exit(1);
  }

  const targetDir = path.resolve(opts.cwd, opts.projectName);
  if (fs.existsSync(targetDir)) {
    console.error(`\n  ✗ Directory already exists: ${targetDir}\n`);
    process.exit(1);
  }

  const files = buildIdentityAppScaffold({
    projectName: opts.projectName,
    brandName: opts.brandName || opts.projectName,
    logoUrl: opts.logoUrl || '/brand/logo.svg',
    sdkVersion: pkg.version,
    provider: provider.id,
  });

  await writeFileTree(targetDir, files);

  writeFeatureSelections(targetDir, {
    schema_version: 2,
    features: {
      auth: {
        selected: true,
        capabilities: ['identity.init'],
        provider_template: provider.id,
        selected_at: new Date().toISOString(),
      },
    },
  });

  console.log(`
  Identity app scaffold ready
  ───────────────────────────
  Path:     ${targetDir}
  Provider: ${provider.id} (${provider.kind})
  Schema:   d1 · auth_users, auth_sessions, account_identities, … (see agentsam identity schema)
  Layout:   app/frontend · backend/src · migrations/

  Next:
    cd ${opts.projectName}
    npm install
    npx wrangler d1 create ${opts.projectName}
    # set database_id in wrangler.toml
    npm run db:migrate:local
    npm run dev
    open http://localhost:8787/auth/login
`);
}
