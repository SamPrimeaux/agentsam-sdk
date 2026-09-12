/**
 * Browser OAuth for SDK init — one click IAM login + Cloudflare connect.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { postJson } from './core-client.js';
import { promptToOpenUrl } from './open-url.js';
import { saveAccountSession } from './account-session.js';

function randomState() {
  return randomBytes(16).toString('hex');
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

  if (!authUrl) throw new Error('IAM auth did not return an authorization URL');

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
        res.end('<html><body style="font-family:system-ui"><h1>Agent Sam</h1><p>Authentication complete. You can close this tab and return to your terminal.</p></body></html>');
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

  await promptToOpenUrl(authUrl, {
    heading: 'Authenticate your InnerAnimalMedia account at:',
    prompt: 'Press ENTER to open InnerAnimalMedia sign-in in your browser.',
  });

  const code = await codePromise;
  const session = await postJson('/api/sdk/auth/exchange', { code, state });
  return session;
}
