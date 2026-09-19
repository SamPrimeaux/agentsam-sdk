import { collectRuntimeStatus } from './runtime-status.js';
import { renderRuntimeStatus } from '../ui/ansi.js';

export async function runStatus(argv = [], opts = {}) {
  const json = argv.includes('--json');
  const allowed = new Set(['--json', '--offline', '--no-discover']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown status option: ${unknown[0]}`);
  const status = await (opts.collectRuntime || collectRuntimeStatus)({
    ...opts,
    cwd: opts.cwd || process.cwd(),
    offline: argv.includes('--offline'),
    discoverModels: !argv.includes('--no-discover'),
  });
  const write = opts.write || ((value) => process.stdout.write(value));
  if (json) {
    write(`${JSON.stringify(status, null, 2)}\n`);
  } else {
    write(`\n${renderRuntimeStatus(status)}\n\n`);
  }
  return status;
}
