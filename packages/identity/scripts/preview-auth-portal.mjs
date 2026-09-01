#!/usr/bin/env node
/**
 * Local static preview for IAM auth portal HTML (1:1 paths: /auth/login, /auth/signup, /auth/reset).
 * API routes are stubbed so forms and globe-exit transitions work without a Worker.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_PORTAL_PAGES_DIR = path.resolve(__dirname, '../src/frontend/auth-portal/pages');
export const AUTH_PORTAL_SHARED_DIR = path.resolve(__dirname, '../src/frontend/auth-portal/shared');
const PREVIEW_DIR = path.resolve(__dirname, '../src/frontend/auth-portal/preview');

const PAGE_ROUTES = {
  '/auth/login': 'login.html',
  '/auth/signup': 'signup.html',
  '/auth/reset': 'reset.html',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function parseArgs(argv) {
  const opts = { port: 8791, host: '127.0.0.1', open: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--open' || arg === '-o') opts.open = true;
    else if (arg === '--port' || arg === '-p') opts.port = Number(argv[++i]) || opts.port;
    else if (arg === '--host' || arg === '-H') opts.host = argv[++i] || opts.host;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
  Auth portal preview — same routes as IAM production HTML shells

  Usage:
    agentsam identity preview [--port 8791] [--open]
    npm run preview:auth-portal

  Pages:
    /auth/login   /auth/signup   /auth/reset

  Preview credentials (any host): email preview@example.com · password preview
  OAuth buttons → stub page with link to globe-exit demo
`);
      process.exit(0);
    }
  }
  return opts;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
  return true;
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const body = await fs.readFile(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(body);
}

function hubHtml(baseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auth portal preview | Agent Sam SDK</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #050508; color: #e2e8f0; margin: 0; padding: 32px; line-height: 1.5; }
    main { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
    p.muted { color: #94a3b8; font-size: 0.95rem; }
    ul { padding-left: 1.2rem; }
    a { color: #38bdf8; }
    code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; }
    .card { margin-top: 24px; padding: 20px; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; background: rgba(255,255,255,0.04); }
  </style>
</head>
<body>
  <main>
    <h1>Auth portal preview</h1>
    <p class="muted">Static HTML synced from IAM <code>static/pages/auth/*</code> — paths match production.</p>
    <div class="card">
      <strong>Pages</strong>
      <ul>
        <li><a href="${baseUrl}/auth/login">/auth/login</a></li>
        <li><a href="${baseUrl}/auth/signup">/auth/signup</a></li>
        <li><a href="${baseUrl}/auth/reset">/auth/reset</a></li>
        <li><a href="${baseUrl}/auth/login?globe_exit=1&amp;next=/preview/dashboard">Globe exit demo</a></li>
      </ul>
      <p><strong>Preview login / signup:</strong> <code>preview@example.com</code> / <code>preview</code></p>
      <p class="muted">Branding loads from <code>GET /api/company</code> via <code>/shared/company-branding.js</code>.</p>
    </div>
  </main>
</body>
</html>`;
}

const PREVIEW_COMPANY = {
  id: 'co_default',
  slug: 'default',
  name: 'Inner Animal Media',
  legalName: 'Inner Animals LLC',
  logoUrl: 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/527ab85a-01bb-4125-57bb-694fe8be8700/public',
  faviconUrl: 'https://inneranimalmedia.com/favicon.ico',
  primaryColor: '#007AFF',
  authBgColor: '#050508',
  supportEmail: 'hey@inneranimalmedia.com',
  websiteUrl: 'https://inneranimalmedia.com',
  tagline: 'Instant Access',
  meta: {
    privacyUrl: '/privacy',
    termsUrl: '/terms',
    contactUrl: '/contact',
    platform: 'preview',
  },
};

function previewLoginSuccess(parsed) {
  return {
    ok: true,
    redirect: parsed.next && String(parsed.next).startsWith('/') ? parsed.next : '/preview/dashboard',
  };
}

function oauthStubHtml(provider, baseUrl) {
  const label = provider === 'github' ? 'GitHub' : 'Google';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>OAuth preview (${label})</title>
<style>body{font-family:system-ui;background:#050508;color:#e2e8f0;padding:32px;max-width:520px;margin:auto;line-height:1.5}a{color:#38bdf8}</style>
</head><body>
<h1>OAuth preview — ${label}</h1>
<p>In production this redirects to the provider. In preview mode, use the link below to simulate a successful return and globe exit.</p>
<p><a href="${baseUrl}/auth/login?globe_exit=1&amp;next=/preview/dashboard">Simulate OAuth success (globe exit)</a></p>
<p><a href="${baseUrl}/auth/login">Back to sign in</a></p>
</body></html>`;
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  async function readJsonBody() {
    let body = '';
    for await (const chunk of req) body += chunk;
    try { return JSON.parse(body || '{}'); } catch { return {}; }
  }

  if (req.method === 'GET' && pathname === '/api/company') {
    return json(res, 200, { ok: true, company: PREVIEW_COMPANY });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const parsed = await readJsonBody();
    const email = String(parsed.email || '').trim().toLowerCase();
    const password = String(parsed.password || '');
    if (email === 'preview@example.com' && password === 'preview') {
      return json(res, 200, previewLoginSuccess(parsed));
    }
    return json(res, 401, { ok: false, error: 'Invalid Identity or Access Key (preview: preview@example.com / preview)' });
  }

  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    const parsed = await readJsonBody();
    const email = String(parsed.email || '').trim().toLowerCase();
    const password = String(parsed.password || '');
    if (!email || !password) {
      return json(res, 400, { ok: false, error: 'email_and_password_required' });
    }
    if (password.length < 8) {
      return json(res, 400, { ok: false, error: 'Password must be at least 8 characters' });
    }
    return json(res, 200, previewLoginSuccess(parsed));
  }

  if (req.method === 'POST' && pathname === '/api/auth/backup-code') {
    return json(res, 200, { ok: true, redirect: '/preview/dashboard' });
  }
  if (req.method === 'POST' && pathname === '/api/auth/password-reset/request') {
    return json(res, 200, { ok: true, message: 'If an account exists, a reset link was sent (preview stub).' });
  }
  if (req.method === 'POST' && pathname === '/api/auth/password-reset/confirm') {
    return json(res, 200, { ok: true, redirect: '/auth/login?reset=success' });
  }
  if (req.method === 'GET' && pathname.startsWith('/api/oauth/')) {
    const provider = pathname.includes('github') ? 'github' : 'google';
    const baseUrl = `${url.protocol}//${url.host}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(oauthStubHtml(provider, baseUrl));
    return true;
  }
  return false;
}

export async function createAuthPortalPreviewServer(opts = {}) {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 8791;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

      if (await handleApi(req, res, url)) return;

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      if (url.pathname === '/' || url.pathname === '/preview') {
        const baseUrl = `${url.protocol}//${url.host}`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(hubHtml(baseUrl));
        return;
      }

      const pageFile = PAGE_ROUTES[url.pathname];
      if (pageFile) {
        await serveFile(res, path.join(AUTH_PORTAL_PAGES_DIR, pageFile));
        return;
      }

      if (url.pathname === '/shared/company-branding.js') {
        await serveFile(res, path.join(AUTH_PORTAL_SHARED_DIR, 'company-branding.js'));
        return;
      }

      if (url.pathname === '/preview/dashboard') {
        const file = path.join(PREVIEW_DIR, 'dashboard-stub.html');
        await serveFile(res, file);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err?.message || 'Server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${host}:${boundPort}`;

  return { server, host, port: boundPort, baseUrl };
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
  child.unref();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { server, baseUrl } = await createAuthPortalPreviewServer(opts);

  console.log(`
  Auth portal preview
  ───────────────────
  Hub:    ${baseUrl}/
  Login:  ${baseUrl}/auth/login
  Signup: ${baseUrl}/auth/signup
  Reset:  ${baseUrl}/auth/reset

  Preview login: preview@example.com / preview
  Ctrl+C to stop
`);

  if (opts.open) openBrowser(`${baseUrl}/auth/login`);

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
