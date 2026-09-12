import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';
import { resolveAgentSamBaseUrl, resolveBridgeKey } from '../lib/bridge-client.js';
import { loadProjectRules } from '../lib/project-rules.js';

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
  const cwd = options.cwd || process.cwd();
  const git = tryResolveGitContext({ cwd, remote: options.remote || 'origin' });
  const rules = loadProjectRules(cwd);
  return {
    schemaVersion: 'agentsam-context-v2',
    git,
    rules: {
      found: rules.found,
      path: rules.path,
      chars: rules.chars,
      source_chars: rules.source_chars || 0,
      truncated: rules.truncated,
      hash: rules.hash,
    },
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
  console.log(`  rules      ${report.rules.found ? `${report.rules.path} · ${report.rules.chars} chars` : 'none'}`);
  console.log(`  core       ${report.bridge.baseUrl}`);
  console.log(`  bridge     ${report.bridge.configured ? 'configured' : 'AGENTSAM_BRIDGE_KEY not set'}`);
  console.log('');
  return report;
}
