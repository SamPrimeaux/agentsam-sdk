import { createAuthPortalPreviewServer } from '../../packages/identity/scripts/preview-auth-portal.mjs';
import { spawn } from 'node:child_process';

function parsePreviewArgs(argv) {
  const opts = { port: 8791, host: '127.0.0.1', open: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--open' || arg === '-o') opts.open = true;
    else if (arg === '--port' || arg === '-p') opts.port = Number(argv[++i]) || opts.port;
    else if (arg === '--host' || arg === '-H') opts.host = argv[++i] || opts.host;
  }
  return opts;
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
  child.unref();
}

export async function runIdentityPreview(argv = []) {
  const opts = parsePreviewArgs(argv);
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

  await new Promise((resolve) => {
    const shutdown = () => server.close(resolve);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
