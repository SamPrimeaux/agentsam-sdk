import { collectLocalStatus } from '../lib/local-status.js';
import { renderLocalStatus } from '../ui/ansi.js';

export async function runStatus(argv = [], opts = {}) {
  const json = argv.includes('--json');
  const status = await collectLocalStatus(opts.cwd || process.cwd());
  if (json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  } else {
    process.stdout.write(`\n${renderLocalStatus(status)}\n\n`);
  }
  return status;
}
