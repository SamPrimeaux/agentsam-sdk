/**
 * Worker API template generator.
 */

export function workerApiTemplates({ projectName, routes, cfAccountId }) {
  const files = {};

  files['package.json'] = JSON.stringify({
    name: projectName,
    version: '0.1.0',
    private: true,
    scripts: {
      deploy: 'wrangler deploy',
      dev: 'wrangler dev',
      'db:migrate': `wrangler d1 execute ${projectName} --file=migrations/001_init.sql --remote`,
    },
    devDependencies: { wrangler: '^3.0.0' },
  }, null, 2);

  files['wrangler.toml'] = `name = "${projectName}"
main = "src/index.js"
compatibility_date = "2024-01-01"
account_id = "${cfAccountId}"

[[d1_databases]]
binding = "DB"
database_name = "${projectName}"
database_id = "REPLACE_WITH_YOUR_D1_ID"
`;

  // Entry
  const routeImports = routes.map(r => `import { handle${cap(r)} } from './routes/${r}.js';`).join('\n');
  const routeMatches = routes.map(r => {
    const path = r === 'health' ? `pathname === '/health'`
      : r === 'auth' ? `pathname.startsWith('/auth')`
      : r === 'webhook' ? `pathname.startsWith('/webhooks')`
      : `pathname.startsWith('/${r}')`;
    return `    if (${path}) return handle${cap(r)}(request, env);`;
  }).join('\n');

  files['src/index.js'] = `${routeImports}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

${routeMatches}

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
`;

  // Route stubs
  if (routes.includes('health')) {
    files['src/routes/health.js'] = `export async function handleHealth(request, env) {
  return Response.json({ ok: true, ts: Date.now() });
}
`;
  }

  if (routes.includes('auth')) {
    files['src/routes/auth.js'] = `export async function handleAuth(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/auth/token' && request.method === 'POST') {
    // TODO: issue token
    return Response.json({ token: 'replace-me' });
  }
  return Response.json({ error: 'Unknown auth route' }, { status: 404 });
}
`;
  }

  if (routes.includes('users')) {
    files['src/routes/users.js'] = `export async function handleUsers(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.replace('/users/', '').replace('/users', '') || null;

  if (request.method === 'GET' && !id) {
    const rows = await env.DB.prepare('SELECT * FROM users LIMIT 50').all();
    return Response.json(rows.results ?? []);
  }
  if (request.method === 'GET' && id) {
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(row);
  }
  if (request.method === 'POST') {
    const body = await request.json();
    const newId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(newId, body.email).run();
    return Response.json({ id: newId }, { status: 201 });
  }
  if (request.method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
`;
  }

  if (routes.includes('content')) {
    files['src/routes/content.js'] = `export async function handleContent(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.replace('/content/', '').replace('/content', '') || null;

  if (request.method === 'GET' && !slug) {
    const rows = await env.DB.prepare("SELECT id, slug, title, status FROM cms_pages LIMIT 50").all();
    return Response.json(rows.results ?? []);
  }
  if (request.method === 'GET' && slug) {
    const row = await env.DB.prepare('SELECT * FROM cms_pages WHERE slug = ?').bind(slug).first();
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(row);
  }
  if (request.method === 'POST') {
    const body = await request.json();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO cms_pages (id, slug, title, template, content_json) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, body.slug, body.title, body.template ?? 'default', JSON.stringify(body.content ?? {})).run();
    return Response.json({ id }, { status: 201 });
  }
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
`;
  }

  if (routes.includes('webhook')) {
    files['src/routes/webhook.js'] = `export async function handleWebhook(request, env) {
  const url = new URL(request.url);
  const type = url.pathname.replace('/webhooks/', '').replace('/webhooks', '') || 'unknown';

  let body;
  try { body = await request.json(); } catch { body = {}; }

  console.log(\`[webhook] type=\${type}\`, JSON.stringify(body));

  // TODO: dispatch based on type
  return Response.json({ received: true, type });
}
`;
  }

  // Migration
  let sql = `-- ${projectName} initial schema\n\n`;
  if (routes.includes('users')) {
    sql += `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);\n\n`;
  }
  if (routes.includes('content')) {
    sql += `CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'default',
  content_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);\n\n`;
  }

  files['migrations/001_init.sql'] = sql;

  files['README.md'] = `# ${projectName}

Scaffolded by [@inneranimalmedia/agentsam-sdk](https://github.com/SamPrimeaux/agentsam-sdk).

## Routes

${routes.map(r => `- \`/${r}\``).join('\n')}

## Deploy

\`\`\`bash
npm install
npx wrangler d1 create ${projectName}
# paste database_id into wrangler.toml
npx wrangler d1 execute ${projectName} --file=migrations/001_init.sql --remote
npx wrangler deploy
\`\`\`
`;

  return files;
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
