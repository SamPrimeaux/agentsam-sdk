/**
 * Browser OAuth for SDK init — one click IAM login + Cloudflare connect.
 */
import http from 'http';
import { randomBytes } from 'crypto';
import { postJson } from './core-client.js';

function randomState() {
  return randomBytes(16).toString('hex');
}

function openBrowser(url) {
  const start =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  import('child_process').then(({ spawn }) => {
    spawn(start[0], start.slice(1), { stdio: 'ignore', detached: true }).unref();
  }).catch(() => {
    console.log(`\n  Open in browser:\n  ${url}\n`);
  });
}

/**
 * @returns {Promise<{ access_token: string, user_id: string, workspace_id: string, tenant_id: string }>}
 */
export async function authenticateViaBrowser() {
  const state = randomState();
  const port = 8791 + (randomBytes(1)[0] % 20);
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const { auth_url: authUrl } = await postJson('/api/sdk/auth/start', {
    redirect_uri: redirectUri,
    state,
  });

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        if (u.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const code = u.searchParams.get('code');
        const gotState = u.searchParams.get('state');
        if (!code || gotState !== state) {
          res.writeHead(400);
          res.end('Invalid callback');
          reject(new Error('auth callback invalid'));
          server.close();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui"><h1>Agent Sam</h1><p>You can close this tab.</p></body></html>');
        resolve(code);
        server.close();
      } catch (e) {
        reject(e);
        server.close();
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });

  console.log('\n  Opening browser for IAM sign-in + Cloudflare connect…\n');
  openBrowser(authUrl);

  const code = await codePromise;
  const session = await postJson('/api/sdk/auth/exchange', { code, state });
  return session;
}
