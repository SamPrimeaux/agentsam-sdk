import { authenticateViaBrowser } from '../lib/auth.js';
import { clearAccountSession, readAccountSession, saveAccountSession } from '../lib/account-session.js';
import { collectWhoami, renderLoginResult, renderWhoami } from './whoami.js';

function writeLine(write, value = '') { write(`${value}\n`); }

export async function runLogin(argv = [], options = {}) {
  const allowed = new Set(['--json']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown login option: ${unknown[0]}`);
  const write = options.write || ((text) => process.stdout.write(text));
  const authenticate = options.authenticateImpl || authenticateViaBrowser;
  const session = await authenticate();
  if (!String(session?.access_token || '').trim()) throw new Error('Agent Sam login did not return a browser session credential');
  // authenticateViaBrowser persists by default. Keep injected transports/test flows equivalent.
  if (!readAccountSession({ home: options.home })) saveAccountSession(session, { home: options.home });
  const status = await collectWhoami({ home: options.home, env: options.env || process.env, contextLoader: options.contextLoader });
  if (argv.includes('--json')) {
    writeLine(write, JSON.stringify({
      ...status,
      login: {
        browser_oauth_saved: true,
        authoritative: status.active_auth?.kind || null,
        oauth_authoritative: status.active_auth?.kind === 'browser_oauth',
        api_key_shadows_oauth:
          Boolean(status.browser_session?.configured)
          && status.active_auth?.kind === 'api_key',
      },
    }, null, 2));
  } else {
    write(renderLoginResult(status));
    write(renderWhoami(status));
  }
  return status;
}

export function runLogout(argv = [], options = {}) {
  const allowed = new Set(['--json']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown logout option: ${unknown[0]}`);
  const write = options.write || ((text) => process.stdout.write(text));
  const removed = clearAccountSession({ home: options.home });
  const result = {
    schema_version: 1,
    local_session_removed: removed,
    provider_credentials_unchanged: true,
    note: 'Local IAM session removed. Provider credentials were not deleted or revoked.',
  };
  if (argv.includes('--json')) writeLine(write, JSON.stringify(result, null, 2));
  else {
    writeLine(write, '');
    writeLine(write, removed ? '  Signed out of the local Agent Sam IAM session.' : '  No local Agent Sam IAM session was stored.');
    writeLine(write, '  Provider credentials were not deleted or revoked.');
    writeLine(write, '');
  }
  return result;
}
