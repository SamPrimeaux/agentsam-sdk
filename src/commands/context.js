import { tryResolveGitContext } from '../lib/git-context.js';
import { resolveAgentSamBaseUrl, resolveBridgeKey } from '../lib/bridge-client.js';

function parseArgs(argv = []) {
  const options = { json: false, cwd: process.cwd(), remote: 'origin' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--cwd') options.cwd = argv[++i] || options.cwd;
    else if (arg === '--remote') options.remote = argv[++i] || options.remote;
    else throw new Error(`unknown context option: ${arg}`);
  }
  return options;
}

export function buildContextReport(options = {}) {
  const env = options.env || process.env;
  const git = tryResolveGitContext({ cwd: options.cwd || process.cwd(), remote: options.remote || 'origin' });
  return {
    schemaVersion: 'agentsam-context-v1',
    git,
    bridge: {
      baseUrl: resolveAgentSamBaseUrl(env),
      configured: Boolean(resolveBridgeKey(env)),
      auth: 'AGENTSAM_BRIDGE_KEY',
    },
  };
}

export async function runContext(argv = []) {
  const options = parseArgs(argv);
  const report = buildContextReport(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  }

  console.log('\n  Agent Sam context\n');
  if (report.git) {
    console.log(`  repo       ${report.git.repoFullName || report.git.root}`);
    console.log(`  root       ${report.git.root}`);
    console.log(`  revision   ${report.git.revisionSha}`);
    console.log(`  branch     ${report.git.branch || '(detached HEAD)'}`);
    console.log(`  dirty      ${report.git.dirty ? 'yes' : 'no'}`);
  } else {
    console.log('  repo       not inside a Git repository');
  }
  console.log(`  core       ${report.bridge.baseUrl}`);
  console.log(`  bridge     ${report.bridge.configured ? 'configured' : 'AGENTSAM_BRIDGE_KEY not set'}`);
  console.log('');
  return report;
}
