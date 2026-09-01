import path from 'node:path';
import { spawn } from 'node:child_process';
import { createMini, MINI_TEMPLATES } from '../lib/mini/scaffold.js';
import { startMiniPreview } from '../lib/mini/preview.js';

export function printMiniHelp() {
  console.log(`
  agentsam mini — small local gadgets and prototypes

  agentsam mini <name>                      Create and preview a timer gadget
  agentsam mini <name> --template page       Create and preview a simple page
  agentsam mini <name> --template data       Create and preview a JSON viewer
  agentsam mini <name> --write-only          Create files without starting anything
  agentsam mini preview <path>              Preview an existing mini
  agentsam mini templates                   List available starters

  --template <gadget|page|data>  Starter (default: gadget)
  --port <0-65535>              Preview port (default: choose an available port)
  --timeout <seconds>           Auto-stop after 1–86400 seconds (default: 1200)
  --open                       Open the local URL in your browser

  Previews run in the foreground on 127.0.0.1. Ctrl+C stops the server.
  Files remain after stopping. Edit public/ and refresh to see changes.
  No dependency install, Docker, login, tunnel, or cloud service is required.
`);
}

function parseArgs(argv) {
  const opts = { template: 'gadget', port: 0, timeoutSeconds: 1200, open: false, writeOnly: false };
  const positional = [];
  let templateSet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--open') opts.open = true;
    else if (arg === '--write-only') opts.writeOnly = true;
    else if (['--template', '--port', '--timeout'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--template') { opts.template = value; templateSet = true; }
      else {
        if (!/^\d+$/.test(value)) throw new Error(`${arg} requires a whole number.`);
        opts[arg === '--port' ? 'port' : 'timeoutSeconds'] = Number(value);
      }
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (opts.port > 65535) throw new Error('--port must be between 0 and 65535.');
  if (opts.timeoutSeconds < 1 || opts.timeoutSeconds > 86400) throw new Error('--timeout must be between 1 and 86400 seconds.');
  const preview = positional[0] === 'preview';
  if (positional.length !== (preview ? 2 : 1)) throw new Error('Provide a name, or preview <path>. See agentsam mini --help.');
  if (preview && (templateSet || opts.writeOnly)) throw new Error('--template and --write-only are creation options.');
  if (opts.writeOnly && opts.open) throw new Error('--open requires a preview; remove --write-only.');
  return { ...opts, preview, target: positional[preview ? 1 : 0] };
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const child = spawn(command, [url], { stdio: 'ignore' });
  child.once('error', () => console.error(`  Could not open a browser. Visit ${url}`));
  child.unref();
}

export async function runMini(argv = []) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { printMiniHelp(); return; }
  if (argv[0] === 'templates') {
    if (argv.length !== 1) throw new Error('Use agentsam mini templates without additional arguments.');
    for (const [name, description] of Object.entries(MINI_TEMPLATES)) console.log(`  ${name.padEnd(10)} ${description}`);
    return;
  }
  const opts = parseArgs(argv);
  const root = opts.preview ? path.resolve(opts.target) : createMini({ name: opts.target, template: opts.template }).root;
  if (!opts.preview) console.log(`\n  Created ${root}`);
  if (opts.writeOnly) {
    console.log(`  Files only. Preview later: agentsam mini preview ${JSON.stringify(root)}\n`);
    return;
  }
  const preview = await startMiniPreview({ root, port: opts.port, timeoutSeconds: opts.timeoutSeconds });
  const interrupt = () => { void preview.stop('Ctrl+C'); };
  const terminate = () => { void preview.stop('SIGTERM'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    console.log(`\n  Preview: ${preview.url}\n  Files:   ${root}/public\n  Auto-stop in ${opts.timeoutSeconds}s. Ctrl+C to stop sooner.\n`);
    if (opts.open) openBrowser(preview.url);
    const reason = await preview.closed;
    console.log(`  Preview stopped (${reason}). Your files remain in ${root}.\n`);
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    await preview.stop();
  }
}
