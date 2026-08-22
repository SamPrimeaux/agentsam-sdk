import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDENTITY_PKG = path.join(SDK_ROOT, 'packages', 'identity');
const AUTH_PAGES_DIR = path.join(IDENTITY_PKG, 'src', 'frontend', 'auth-portal', 'pages');
const MIGRATION_FILE = path.join(IDENTITY_PKG, 'src', 'migrations', '0001_identity_core.sql');

/**
 * @param {{ projectName: string, brandName?: string, logoUrl?: string, sdkVersion?: string }} config
 * @returns {Record<string, string>}
 */
export function buildIdentityAppScaffold(config) {
  const projectName = config.projectName;
  const brandName = config.brandName || projectName;
  const logoUrl = config.logoUrl || '/brand/logo.svg';
  const sdkVersion = config.sdkVersion || 'alpha';

  const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const loginHtml = applyBrandTokens(fs.readFileSync(path.join(AUTH_PAGES_DIR, 'login.html'), 'utf8'), {
    brandName,
    logoUrl,
  });
  const signupHtml = applyBrandTokens(fs.readFileSync(path.join(AUTH_PAGES_DIR, 'signup.html'), 'utf8'), {
    brandName,
    logoUrl,
  });
  const resetHtml = applyBrandTokens(fs.readFileSync(path.join(AUTH_PAGES_DIR, 'reset.html'), 'utf8'), {
    brandName,
    logoUrl,
  });

  const files = {};

  files['package.json'] = JSON.stringify({
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
      'db:migrate:local': `wrangler d1 execute ${projectName} --local --file=migrations/0001_identity_core.sql`,
      'db:migrate': `wrangler d1 execute ${projectName} --remote --file=migrations/0001_identity_core.sql`,
      preview: 'npx agentsam identity preview --open',
    },
    dependencies: {
      '@inneranimalmedia/agentsam-sdk': sdkVersion.startsWith('^') || sdkVersion.startsWith('@')
        ? sdkVersion
        : `^${sdkVersion}`,
    },
    devDependencies: {
      wrangler: '^4.0.0',
    },
  }, null, 2);

  files['wrangler.toml'] = `name = "${projectName}"
main = "backend/src/index.js"
compatibility_date = "2024-06-01"

[assets]
directory = "app/frontend"
binding = "ASSETS"
run_worker_first = true

[[d1_databases]]
binding = "DB"
database_name = "${projectName}"
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
migrations_dir = "migrations"
`;

  files['.env.example'] = `# Copy to .env / wrangler secret for production
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
`;

  files['.gitignore'] = `node_modules/
.wrangler/
.dev.vars
.env
.DS_Store
`;

  files['README.md'] = `# ${brandName} — identity app

Boring scaffold: **app/frontend** (auth UI) + **backend** (Worker API) + **migrations** (D1).

## Quick start

\`\`\`bash
npm install
npx wrangler d1 create ${projectName}
# paste database_id into wrangler.toml
npm run db:migrate:local
npm run dev
# open http://localhost:8787/auth/login
\`\`\`

OAuth: set \`GOOGLE_CLIENT_ID\` / \`GITHUB_CLIENT_ID\` (+ secrets) in \`.dev.vars\` or Wrangler secrets.

## Layout

\`\`\`
app/frontend/     Auth portal HTML + dashboard stub
backend/src/      Cloudflare Worker (identity routes)
migrations/       D1 schema
\`\`\`
`;

  files['migrations/0001_identity_core.sql'] = migrationSql;

  files['app/frontend/auth/login.html'] = loginHtml;
  files['app/frontend/auth/signup.html'] = signupHtml;
  files['app/frontend/auth/reset.html'] = resetHtml;

  files['app/frontend/dashboard/index.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard | ${brandName}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; min-height: 100vh; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #334155; }
    main { max-width: 720px; margin: 48px auto; padding: 0 24px; }
    button { background: #2563eb; color: white; border: 0; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
    .muted { color: #94a3b8; }
  </style>
</head>
<body>
  <header>
    <strong>${brandName}</strong>
    <button id="logout">Sign out</button>
  </header>
  <main>
    <h1>Dashboard</h1>
    <p class="muted">Session-protected stub — grow from here.</p>
    <p id="user"></p>
  </main>
  <script>
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.ok) { window.location.href = '/auth/login?next=/dashboard/home'; return; }
        document.getElementById('user').textContent = d.user.email + ' (' + d.user.id + ')';
      });
    document.getElementById('logout').addEventListener('click', function() {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .then(function() { window.location.href = '/auth/login'; });
    });
  </script>
</body>
</html>
`;

  files['backend/src/index.js'] = `import { handleIdentityWorkerRequest } from '@inneranimalmedia/agentsam-sdk/identity/server/worker-router';

export default {
  async fetch(request, env, ctx) {
    return handleIdentityWorkerRequest(request, env);
  },
};
`;

  return files;
}

function applyBrandTokens(html, { brandName, logoUrl }) {
  return html
    .replace(/Inner Animal Media/g, brandName)
    .replace(/Sign in \| Inner Animal Media/g, `Sign in | ${brandName}`)
    .replace(/Sign up \| Inner Animal Media/g, `Sign up | ${brandName}`)
    .replace(/Reset password \| Inner Animal Media/g, `Reset password | ${brandName}`)
    .replace(/src="\/brand\/[^"]*"/g, `src="${logoUrl}"`)
    .replace(/href="\/brand\/[^"]*"/g, `href="${logoUrl}"`);
}

export function resolveIdentityPagesDir() {
  return AUTH_PAGES_DIR;
}
