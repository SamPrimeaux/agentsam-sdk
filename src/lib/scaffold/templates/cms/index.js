/**
 * CMS template generator.
 * Returns a flat file-tree object keyed by relative path → file content string.
 */

export function cmsTemplates(config) {
  const { projectName, siteTitle, navStyle, pages, templateStyle, contactEmail, cfAccountId } = config;

  const files = {};

  // ── package.json ──────────────────────────────────────────────────────────
  files['package.json'] = JSON.stringify({
    name: projectName,
    version: '0.1.0',
    private: true,
    scripts: {
      deploy: 'wrangler deploy',
      dev: 'wrangler dev',
      'db:migrate': `wrangler d1 execute ${projectName} --file=migrations/001_init.sql --remote`,
    },
    devDependencies: {
      wrangler: '^3.0.0',
    },
  }, null, 2);

  // ── wrangler.toml ─────────────────────────────────────────────────────────
  files['wrangler.toml'] = `name = "${projectName}"
main = "src/index.js"
compatibility_date = "2024-01-01"
account_id = "${cfAccountId}"

[[d1_databases]]
binding = "DB"
database_name = "${projectName}"
database_id = "REPLACE_WITH_YOUR_D1_ID"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "${projectName}"
`;

  // ── D1 migration ──────────────────────────────────────────────────────────
  let migrationSql = `-- ${projectName} initial schema\n\n`;

  migrationSql += `CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'default',
  content_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);\n\n`;

  migrationSql += `CREATE TABLE IF NOT EXISTS cms_nav_items (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);\n\n`;

  if (pages.includes('blog')) {
    migrationSql += `CREATE TABLE IF NOT EXISTS cms_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  published_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);\n\n`;
  }

  if (contactEmail) {
    migrationSql += `CREATE TABLE IF NOT EXISTS cms_contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);\n\n`;
  }

  // Seed nav items from selected pages
  const navOrder = ['home', 'about', 'services', 'blog', 'contact'];
  const navPages = navOrder.filter(p => pages.includes(p));
  navPages.forEach((page, i) => {
    const label = page.charAt(0).toUpperCase() + page.slice(1);
    const href = page === 'home' ? '/' : `/${page}`;
    migrationSql += `INSERT OR IGNORE INTO cms_nav_items (id, label, href, position) VALUES ('nav_${page}', '${label}', '${href}', ${i});\n`;
  });

  files['migrations/001_init.sql'] = migrationSql;

  // ── Worker entry point ────────────────────────────────────────────────────
  files['src/index.js'] = workerEntry(config);

  // ── Route handlers ────────────────────────────────────────────────────────
  files['src/routes/pages.js'] = pagesRoute(config);
  files['src/routes/nav.js'] = navRoute();

  if (pages.includes('blog')) {
    files['src/routes/blog.js'] = blogRoute();
  }

  if (contactEmail) {
    files['src/routes/contact.js'] = contactRoute(contactEmail);
  }

  // ── HTML shell template ───────────────────────────────────────────────────
  files['src/templates/shell.js'] = htmlShell(config);

  // ── Nav component ─────────────────────────────────────────────────────────
  files['src/templates/nav.js'] = navComponent(navStyle, siteTitle);

  // ── Page templates ────────────────────────────────────────────────────────
  pages.forEach(page => {
    files[`src/templates/pages/${page}.js`] = pageTemplate(page, siteTitle, templateStyle);
  });

  // ── README ────────────────────────────────────────────────────────────────
  files['README.md'] = readme(config);

  return files;
}

// ── Worker entry ─────────────────────────────────────────────────────────────
function workerEntry({ projectName, pages, contactEmail }) {
  const imports = [`import { handlePages } from './routes/pages.js';`,
    `import { handleNav } from './routes/nav.js';`];

  if (pages.includes('blog')) imports.push(`import { handleBlog } from './routes/blog.js';`);
  if (contactEmail) imports.push(`import { handleContact } from './routes/contact.js';`);

  return `${imports.join('\n')}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // API routes
    if (pathname.startsWith('/api/nav')) return handleNav(request, env);
${pages.includes('blog') ? `    if (pathname.startsWith('/api/blog')) return handleBlog(request, env);\n` : ''}${contactEmail ? `    if (pathname === '/api/contact' && request.method === 'POST') return handleContact(request, env);\n` : ''}
    // Page routes — catch-all
    return handlePages(request, env);
  },
};
`;
}

// ── Route: pages ─────────────────────────────────────────────────────────────
function pagesRoute({ pages, templateStyle, siteTitle }) {
  return `import { renderShell } from '../templates/shell.js';
import { renderNav } from '../templates/nav.js';
${pages.map(p => `import { render${cap(p)}Page } from '../templates/pages/${p}.js';`).join('\n')}

const PAGE_MAP = {
${pages.map(p => `  '${p === 'home' ? '/' : `/${p}`}': render${cap(p)}Page,`).join('\n')}
};

export async function handlePages(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.replace(/\\/$/, '') || '/';

  const renderPage = PAGE_MAP[slug];
  if (!renderPage) {
    return new Response(renderShell('404', renderNav([]), '<h1>Page not found</h1>'), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  // Load nav from D1
  const navRows = await env.DB.prepare(
    'SELECT label, href FROM cms_nav_items ORDER BY position ASC'
  ).all();
  const nav = renderNav(navRows.results ?? []);

${templateStyle === 'fragment'
  ? `  // Load page fragment from R2
  const fragmentKey = \`pages/\${slug === '/' ? 'home' : slug.slice(1)}/content.html\`;
  const fragment = await env.ASSETS.get(fragmentKey);
  const content = fragment ? await fragment.text() : renderPage();`
  : templateStyle === 'json'
  ? `  // Load page content from D1
  const pageRow = await env.DB.prepare(
    'SELECT content_json FROM cms_pages WHERE slug = ? AND status = \\'published\\''
  ).bind(slug === '/' ? 'home' : slug.slice(1)).first();
  const content = renderPage(pageRow?.content_json ? JSON.parse(pageRow.content_json) : {});`
  : `  const content = renderPage();`}

  const html = renderShell('${siteTitle}', nav, content);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
`;
}

// ── Route: nav ───────────────────────────────────────────────────────────────
function navRoute() {
  return `export async function handleNav(request, env) {
  const rows = await env.DB.prepare(
    'SELECT id, label, href, position FROM cms_nav_items ORDER BY position ASC'
  ).all();
  return Response.json(rows.results ?? []);
}
`;
}

// ── Route: blog ──────────────────────────────────────────────────────────────
function blogRoute() {
  return `import { renderShell } from '../templates/shell.js';
import { renderNav } from '../templates/nav.js';

export async function handleBlog(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.replace('/blog/', '').replace('/blog', '');

  if (slug && slug !== '/') {
    // Single post
    const post = await env.DB.prepare(
      'SELECT * FROM cms_posts WHERE slug = ? AND status = \\'published\\''
    ).bind(slug).first();

    if (!post) return new Response('Post not found', { status: 404 });

    const navRows = await env.DB.prepare('SELECT label, href FROM cms_nav_items ORDER BY position ASC').all();
    const html = renderShell(post.title, renderNav(navRows.results ?? []), \`
      <article>
        <h1>\${post.title}</h1>
        <div class="post-body">\${post.body ?? ''}</div>
      </article>
    \`);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  // Post list
  const posts = await env.DB.prepare(
    'SELECT slug, title, published_at FROM cms_posts WHERE status = \\'published\\' ORDER BY published_at DESC LIMIT 20'
  ).all();

  const navRows = await env.DB.prepare('SELECT label, href FROM cms_nav_items ORDER BY position ASC').all();
  const listHtml = (posts.results ?? []).map(p =>
    \`<li><a href="/blog/\${p.slug}">\${p.title}</a></li>\`
  ).join('');

  const html = renderShell('Blog', renderNav(navRows.results ?? []), \`
    <h1>Blog</h1>
    <ul class="post-list">\${listHtml}</ul>
  \`);
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
`;
}

// ── Route: contact ────────────────────────────────────────────────────────────
function contactRoute(email) {
  return `export async function handleContact(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, email: fromEmail, message } = body;
  if (!name || !fromEmail || !message) {
    return Response.json({ error: 'name, email, and message are required' }, { status: 400 });
  }

  // Save to D1
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO cms_contact_submissions (id, name, email, message) VALUES (?, ?, ?, ?)'
  ).bind(id, name, fromEmail, message).run();

  // Send via Resend (requires RESEND_API_KEY secret)
  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${env.RESEND_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@yourdomain.com',
        to: '${email}',
        subject: \`New contact form submission from \${name}\`,
        text: \`Name: \${name}\\nEmail: \${fromEmail}\\n\\n\${message}\`,
      }),
    });
  }

  return Response.json({ ok: true, id });
}
`;
}

// ── Template: HTML shell ──────────────────────────────────────────────────────
function htmlShell({ siteTitle }) {
  return `export function renderShell(pageTitle, navHtml, bodyHtml) {
  return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>\${pageTitle} — ${siteTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; color: #1a1a1a; background: #fff; }
    a { color: inherit; }
    main { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    h2 { font-size: 1.4rem; margin-bottom: 0.75rem; }
    p  { line-height: 1.65; margin-bottom: 1rem; }
  </style>
</head>
<body>
  \${navHtml}
  <main>\${bodyHtml}</main>
</body>
</html>\`;
}
`;
}

// ── Template: nav component ───────────────────────────────────────────────────
function navComponent(navStyle, siteTitle) {
  const styles = {
    topbar: `
    nav { display: flex; align-items: center; gap: 2rem; background: #111; padding: 0 1.5rem; height: 56px; }
    nav .site-title { color: #fff; font-weight: 700; font-size: 1.1rem; text-decoration: none; margin-right: auto; }
    nav a { color: #ccc; text-decoration: none; font-size: 0.9rem; }
    nav a:hover { color: #fff; }`,
    sidebar: `
    .nav-sidebar { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; background: #111; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .nav-sidebar .site-title { color: #fff; font-weight: 700; font-size: 1.1rem; text-decoration: none; margin-bottom: 1rem; }
    .nav-sidebar a { color: #ccc; text-decoration: none; font-size: 0.9rem; padding: 0.4rem 0.6rem; border-radius: 4px; }
    .nav-sidebar a:hover { background: #222; color: #fff; }
    body { padding-left: 220px; }`,
    minimal: `
    nav { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-bottom: 1px solid #eee; }
    nav .site-title { font-weight: 700; font-size: 1.1rem; text-decoration: none; }
    .nav-toggle { background: none; border: none; cursor: pointer; font-size: 1.2rem; }`,
  }[navStyle];

  const navClass = navStyle === 'sidebar' ? 'class="nav-sidebar"' : '';

  return `export function renderNav(items) {
  const links = items.map(i => \`<a href="\${i.href}">\${i.label}</a>\`).join('');
  return \`<style>${styles}</style>
<nav ${navClass}>
  <a class="site-title" href="/">${siteTitle}</a>
  \${links}
</nav>\`;
}
`;
}

// ── Template: individual page templates ──────────────────────────────────────
function pageTemplate(page, siteTitle, templateStyle) {
  const pageContent = {
    home: `<section class="hero">
    <h1>Welcome to ${siteTitle}</h1>
    <p>Your tagline goes here.</p>
  </section>`,
    about: `<h1>About Us</h1>
  <p>Tell your story here.</p>`,
    services: `<h1>Services</h1>
  <ul>
    <li>Service one</li>
    <li>Service two</li>
    <li>Service three</li>
  </ul>`,
    contact: `<h1>Contact</h1>
  <form id="contact-form">
    <div><label>Name<br><input type="text" name="name" required /></label></div>
    <div><label>Email<br><input type="email" name="email" required /></label></div>
    <div><label>Message<br><textarea name="message" required></textarea></label></div>
    <button type="submit">Send</button>
  </form>
  <script>
    document.getElementById('contact-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const res = await fetch('/api/contact', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
      if (res.ok) { e.target.reset(); alert('Message sent!'); }
    });
  </script>`,
    blog: `<h1>Blog</h1><p>Loading posts...</p>`,
    privacy: `<h1>Privacy Policy</h1>
  <p>Last updated: ${new Date().toLocaleDateString()}</p>
  <p>We do not sell your data. Replace this with your actual privacy policy.</p>`,
  };

  const body = pageContent[page] ?? `<h1>${cap(page)}</h1><p>Content coming soon.</p>`;

  if (templateStyle === 'json') {
    return `export function render${cap(page)}Page(data = {}) {
  return \`${body}\`;
}
`;
  }

  return `export function render${cap(page)}Page() {
  return \`${body}\`;
}
`;
}

// ── README ────────────────────────────────────────────────────────────────────
function readme({ projectName, siteTitle, pages, navStyle, templateStyle }) {
  return `# ${siteTitle}

Scaffolded by [@inneranimalmedia/agentsam-sdk](https://github.com/SamPrimeaux/agentsam-sdk).

## Stack

- Cloudflare Worker (entry: \`src/index.js\`)
- D1 database (binding: \`DB\`)
- R2 bucket (binding: \`ASSETS\`)
- Template style: \`${templateStyle}\`
- Nav style: \`${navStyle}\`

## Pages

${pages.map(p => `- \`${p === 'home' ? '/' : `/${p}`}\` — ${cap(p)}`).join('\n')}

## Deploy

\`\`\`bash
npm install

# Create D1 (copy the returned database_id into wrangler.toml)
npx wrangler d1 create ${projectName}

# Run migration
npx wrangler d1 execute ${projectName} --file=migrations/001_init.sql --remote

# Deploy
npx wrangler deploy
\`\`\`

## Environment secrets

| Secret | Purpose |
|--------|---------|
| \`RESEND_API_KEY\` | Contact form email delivery (optional) |

Set with: \`npx wrangler secret put RESEND_API_KEY\`
`;
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
