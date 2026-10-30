/** Serve product HTML through the existing packaged-console route authority in Vite. */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveConsoleFile} from '../backend/worker/packaged-console.js';
const publicAdmin = fileURLToPath(new URL('../frontend/public/admin/', import.meta.url));
export function consoleDevPlugin() {
  return {name:'agentsam:packaged-console-dev',apply:'serve',configureServer(server) {
    server.middlewares.use((request,response,next) => {
      if (!['GET','HEAD'].includes(request.method || 'GET')) return next();
      const url = new URL(request.url || '/', 'http://localhost');
      const allowEmbeddedHome = url.pathname === '/admin/home' && url.searchParams.get('__agentsamEmbedded') === '1';
      const file = resolveConsoleFile(url.pathname, { allowEmbeddedHome });
      if (!file?.endsWith('.html')) return next();
      let html;
      try { html = readFileSync(path.join(publicAdmin,file)); } catch { return next(); }
      response.statusCode=200;
      response.setHeader('content-type','text/html; charset=utf-8');
      response.setHeader('cache-control','no-store');
      response.end(request.method === 'HEAD' ? undefined : html);
    });
  }};
}
