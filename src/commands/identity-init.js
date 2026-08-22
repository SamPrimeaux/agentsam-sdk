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
    yes: false,
    cwd: process.cwd(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--name') opts.projectName = argv[++i] || '';
    else if (arg === '--brand') opts.brandName = argv[++i] || '';
    else if (arg === '--logo-url') opts.logoUrl = argv[++i] || '';
    else if (arg === '--cwd') opts.cwd = argv[++i] || opts.cwd;
  }
  return opts;
}

export async function runIdentityInit(argv = []) {
  const opts = parseArgs(argv);
  if (!opts.projectName) {
    console.error('\n  Usage: agentsam identity init --name <project> [--brand "App Name"] [--logo-url /logo.svg]\n');
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
  });

  await writeFileTree(targetDir, files);

  console.log(`
  Identity app scaffold ready
  ───────────────────────────
  Path:   ${targetDir}
  Layout: app/frontend · backend/src · migrations/

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
