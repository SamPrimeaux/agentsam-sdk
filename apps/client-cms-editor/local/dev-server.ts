/**
 * Local CMS + public storefront runtime.
 * One process, one SQLite authority, multipage public routes + /cms.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CmsEditorAdapter } from '../shared/cms/src/adapter';
import {
  createLocalDevAuthHost,
  isCmsProtectedPath,
  type CmsAuthHost,
} from '../import/auth-host';
import {
  normalizePublicPath,
  renderCmsShellHtml,
  renderPublishedPageHtml,
  resolvePublishedPage,
} from './public-renderer';

export type LocalCmsRuntimeOptions = {
  adapter: CmsEditorAdapter;
  siteId: string;
  port?: number;
  host?: string;
  cmsBase?: string;
  authHost?: CmsAuthHost;
  /** Optional assets directory to serve under /assets/ */
  assetsDir?: string;
};

export type LocalCmsRuntime = {
  port: number;
  host: string;
  origin: string;
  close: () => Promise<void>;
};

async function readBody(_req: IncomingMessage): Promise<Buffer> {
  return Buffer.alloc(0);
}

export async function startLocalCmsRuntime(options: LocalCmsRuntimeOptions): Promise<LocalCmsRuntime> {
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 4317;
  const cmsBase = options.cmsBase || '/cms';
  const authHost = options.authHost || createLocalDevAuthHost();
  const site = await options.adapter.getSite(options.siteId);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      const pathname = normalizePublicPath(url.pathname);

      if (isCmsProtectedPath(pathname, cmsBase)) {
        const decision = await authHost.authorizeCmsAccess({
          path: pathname,
          method: req.method,
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
          ),
        });
        if (!decision.allowed) {
          res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(decision.reason || 'unauthorized');
          return;
        }
        const html = renderCmsShellHtml({ siteName: site.name, cmsBase });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (pathname === '/__agentsam/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, siteId: options.siteId }));
        return;
      }

      const resolved = await resolvePublishedPage(options.adapter, options.siteId, pathname);
      if (!resolved) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><body><h1>Not published</h1><p>No published page for <code>${pathname}</code>.</p><p><a href="${cmsBase}">Open CMS</a></p></body></html>`);
        return;
      }

      const html = renderPublishedPageHtml(resolved);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String((error as Error)?.message || error));
    } finally {
      await readBody(req);
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolveListen());
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: boundPort,
    host,
    origin: `http://${host}:${boundPort}`,
    close: () =>
      new Promise((resolveClose, reject) => {
        server.close((err) => (err ? reject(err) : resolveClose()));
      }),
  };
}

export function ensureSqlitePath(dbPath: string) {
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  return resolve(dbPath);
}
