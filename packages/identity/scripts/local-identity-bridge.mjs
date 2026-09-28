#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import {
  applySqliteIdentityMigrations,
  createSqliteIdentityAdapter,
} from '../src/adapters/sqlite/index.js';
import {
  createRouteRegistry,
  projectionFromAppManifest,
} from '../src/contracts/route-projection.js';
import { createIdentityService } from '../src/server/identity-service.js';
import { hashPassword } from '../src/core/password-crypto.js';

function readStdin() {
  return new Promise((resolve, reject) => {
    let body = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { body += chunk; });
    process.stdin.on('end', () => {
      try { resolve(body.trim() ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    process.stdin.on('error', reject);
  });
}

function wrapDatabase(database, filePath) {
  return {
    filePath,
    prepare(sql) {
      const statement = database.prepare(sql);
      const bound = (values = []) => ({
        async run() { return statement.run(...values); },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
      });
      return {
        bind(...values) { return bound(values); },
        async run() { return statement.run(); },
        async first() { return statement.get() ?? null; },
        async all() { return { results: statement.all() }; },
      };
    },
    exec(sql) { database.exec(sql); },
    close() { database.close(); },
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name ?? null,
    status: user.status ?? null,
  };
}

const request = await readStdin();
const dbPath = path.resolve(
  process.env.AGENTSAM_IDENTITY_DB || '.agentsam/data/local-studio-identity.sqlite',
);
const manifestPath = path.resolve(
  process.env.AGENTSAM_IDENTITY_APP_MANIFEST
    || new URL('../../../apps/local-studio/agentsam.app.json', import.meta.url).pathname,
);

fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
const nativeDb = new DatabaseSync(dbPath);
try {
  if (process.platform !== 'win32') {
    try { fs.chmodSync(dbPath, 0o600); } catch {}
  }
  const db = wrapDatabase(nativeDb, dbPath);
  await applySqliteIdentityMigrations(db);
  const adapter = createSqliteIdentityAdapter(db);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const routeRegistry = createRouteRegistry([projectionFromAppManifest(manifest)]);
  const identity = createIdentityService({
    adapter,
    app: { id: manifest.id },
    routeRegistry,
  });

  let result;
  switch (request.op) {
    case 'status': {
      const sessionId = String(request.session_id || '').trim();
      if (!sessionId) {
        result = { ok: true, authenticated: false, user: null };
        break;
      }
      const session = await identity.sessionFromRequest(new Request('http://local.identity/session', {
        headers: { Authorization: `Bearer ${sessionId}` },
      }));
      result = {
        ok: true,
        authenticated: Boolean(session),
        user: sanitizeUser(session?.user),
      };
      break;
    }

    case 'login': {
      const login = await identity.loginWithPassword({
        email: request.email,
        password: request.password,
      });
      result = login.ok
        ? {
            ok: true,
            authenticated: true,
            session_id: login.sessionId,
            user: sanitizeUser(login.user),
            redirect: identity.resolvePostLoginPath(request.next || null),
          }
        : login;
      break;
    }

    case 'signup': {
      const signup = await identity.signup({
        email: request.email,
        password: request.password,
        displayName: request.display_name,
      });
      result = signup.ok
        ? {
            ok: true,
            authenticated: true,
            session_id: signup.sessionId,
            user: sanitizeUser(signup.user),
            redirect: identity.resolvePostLoginPath(request.next || null),
          }
        : signup;
      break;
    }

    case 'logout': {
      const sessionId = String(request.session_id || '').trim();
      if (sessionId) {
        await identity.logout(new Request('http://local.identity/logout', {
          headers: { Authorization: `Bearer ${sessionId}` },
        }));
      }
      result = { ok: true };
      break;
    }

    case 'reset_password': {
      const email = String(request.email || '').trim().toLowerCase();
      const password = String(request.password || '');
      if (!email || password.length < 8) {
        result = { ok: false, error: 'email_and_valid_password_required' };
        break;
      }
      const user = await adapter.findUserByEmail(email);
      if (!user) {
        result = { ok: false, error: 'account_not_found' };
        break;
      }
      const { saltHex, hashHex } = await hashPassword(password);
      await adapter.updateUserPassword(user.id, hashHex, saltHex);
      result = { ok: true };
      break;
    }

    default:
      result = { ok: false, error: 'unsupported_identity_operation' };
  }

  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
  }));
  process.exitCode = 1;
} finally {
  try { nativeDb.close(); } catch {}
}
