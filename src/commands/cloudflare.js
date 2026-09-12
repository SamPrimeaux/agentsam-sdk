import path from 'node:path';
import { listWranglerNativeCommands, runWranglerNative, summarizeCloudflareCpuProfileFile, WRANGLER_OPERATION_FAMILIES } from '../cloudflare/index.js';
import { renderDiagnosticError } from '../errors/index.js';

function parse(argv = []) {
  const out = { subcommand: argv[0] || 'status', action: argv[1] || '', cwd: process.cwd(), json: false, name: '', account: '', config: '', env: '', profile: '', path: '', page: null, file: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--cwd') out.cwd = argv[++i] || out.cwd;
    else if (arg === '--name') out.name = argv[++i] || '';
    else if (arg === '--account') out.account = argv[++i] || '';
    else if (arg === '--config') out.config = argv[++i] || '';
    else if (arg === '--env') out.env = argv[++i] || '';
    else if (arg === '--profile') out.profile = argv[++i] || '';
    else if (arg === '--path') out.path = argv[++i] || '';
    else if (arg === '--page') out.page = Number(argv[++i] || 1);
    else if (arg === '--file') out.file = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (out.subcommand === 'cpu' && out.action === 'analyze' && !out.file) out.file = arg;
    else throw new Error(`unknown cloudflare option: ${arg}`);
  }
  return out;
}

const help = `Agent Sam · Cloudflare\n\n  agentsam cloudflare status [--cwd PATH] [--json]\n  agentsam cloudflare commands [--json]\n  agentsam cloudflare run <whoami|deployments.list|versions.list|types.check|queues.list> [options] [--json]\n  agentsam cloudflare cpu analyze <profile.cpuprofile> [--cwd PATH] [--json]\n\nSafe native runner is read-only. Deploy, rollback, secret reads, D1 mutation, R2 writes, and long-running tail/dev sessions remain explicit operator actions.\n`;

export async function runCloudflare(argv = [], options = {}) {
  const args = parse(argv);
  const write = options.write || ((value) => process.stdout.write(value));
  if (args.help) { write(help); return null; }
  try {
    let result;
    if (args.subcommand === 'status') {
      result = await runWranglerNative('whoami', args, options);
    } else if (args.subcommand === 'commands') {
      result = { schema_version: 1, native: listWranglerNativeCommands(), families: WRANGLER_OPERATION_FAMILIES };
    } else if (args.subcommand === 'run') {
      if (!args.action) throw new Error('cloudflare native command id required');
      result = await runWranglerNative(args.action, args, options);
    } else if (args.subcommand === 'cpu' && args.action === 'analyze') {
      result = summarizeCloudflareCpuProfileFile({ cwd: path.resolve(args.cwd), file: args.file });
    } else {
      write(help);
      return null;
    }
    write(args.json ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    if (args.json) write(`${JSON.stringify({ ok: false, error: error?.diagnostic || { code: error?.code || 'cloudflare_operation_failed', message: error?.message || String(error) } })}\n`);
    else write(`${renderDiagnosticError(error)}\n`);
    throw error;
  }
}
