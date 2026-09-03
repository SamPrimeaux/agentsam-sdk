import { captureDeployReceipt, finalizeDeployReceipt, showLatestDeployReceipt } from '../lib/deploy-receipt/index.js';

export function printDeployReceiptHelp() {
  console.log(`
  agentsam deploy-receipt — reusable Merkle deployment/checkpoint lifecycle

  capture [path]              Capture the current tree and compare to the last promoted baseline
  success [path]              Finalize a successful run and promote its snapshot to latest
  failure [path]              Finalize a failed run without advancing the baseline
  show [path]                 Print the latest promoted receipt

  --project <id>              Logical project identifier (defaults to directory name)
  --state-dir <path>          Runtime state directory (default: .agentsam/deploy-merkle)
  --baseline <snapshot>       Explicit baseline snapshot for capture (e.g. restored from R2)
  --baseline-source <label>   Baseline provenance label (e.g. r2, local-cache)
  --include <default-rule>    Include one AgentSam default-ignored category
  --exclude <path-or-name>    Additional literal exclusion (repeatable)
  --max-changed-files <n>     Receipt path cap (default 100)
  --deployment-id <id>        Deployment/ledger identity for success/failure
  --worker-version <id>       Provider version identity for success/failure
  --metadata-json <json>      Extra compact receipt metadata object
  --json                      Machine-readable output

  Runtime state is intentionally not source. The state directory is excluded from the
  captured Merkle tree, successful finalize advances latest.*, and failure never does.

  Examples:
    agentsam deploy-receipt capture . --project my-worker --json
    wrangler deploy
    agentsam deploy-receipt success . --deployment-id dep_123 --json
    agentsam deploy-receipt failure . --deployment-id dep_124 --json
`);
}

function parseJsonObject(value, flag) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${flag} must be valid JSON.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${flag} must be a JSON object.`);
  return parsed;
}

function parse(argv) {
  const [command, ...args] = argv;
  const normalized = command === 'fail' ? 'failure' : command === 'promote' ? 'success' : command;
  if (!['capture', 'success', 'failure', 'show'].includes(normalized)) throw new Error(`Unknown deploy-receipt command: ${command || ''}`);
  const opts = { command: normalized, root: '.', include: [], exclude: [], json: false, metadata: {} };
  let positional = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { positional = true; continue; }
    if (positional || !arg.startsWith('-')) {
      if (opts.root !== '.') throw new Error('Only one root path may be supplied.');
      opts.root = arg;
      continue;
    }
    if (arg === '--json') { opts.json = true; continue; }
    if (['--project', '--state-dir', '--baseline', '--baseline-source', '--deployment-id', '--worker-version', '--metadata-json', '--max-changed-files', '--include', '--exclude'].includes(arg)) {
      const value = args[++i];
      if (value == null || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--include') opts.include.push(value);
      else if (arg === '--exclude') opts.exclude.push(value);
      else if (arg === '--metadata-json') opts.metadata = parseJsonObject(value, arg);
      else if (arg === '--max-changed-files') {
        const count = Number(value);
        if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('--max-changed-files must be an integer from 1 to 10000.');
        opts.maxChangedFiles = count;
      } else opts[arg.slice(2).replaceAll('-', '_')] = value;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (opts.command !== 'capture' && (opts.baseline || opts.baseline_source || opts.include.length || opts.exclude.length || opts.maxChangedFiles)) {
    throw new Error('Baseline/include/exclude/change-cap options apply only to capture.');
  }
  if (!['success', 'failure'].includes(opts.command) && (opts.deployment_id || opts.worker_version)) {
    throw new Error('--deployment-id and --worker-version apply only to success/failure.');
  }
  return opts;
}

function human(result, command) {
  if (!result) return 'No promoted deploy receipt.\n';
  const receipt = result.receipt || result;
  if (command === 'capture') {
    const delta = receipt.diff_stats ? `${receipt.diff_stats.added} added, ${receipt.diff_stats.modified} modified, ${receipt.diff_stats.removed} removed` : 'no baseline';
    return `Captured ${receipt.root_hash} (${delta}; baseline=${receipt.baseline_source}).\n`;
  }
  return `${receipt.status}: ${receipt.root_hash}${receipt.deployment_id ? ` deployment=${receipt.deployment_id}` : ''}\n`;
}

export async function runDeployReceipt(argv = []) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { printDeployReceiptHelp(); return; }
  try {
    const opts = parse(argv);
    let result;
    if (opts.command === 'capture') {
      result = await captureDeployReceipt({
        root: opts.root,
        project: opts.project,
        stateDir: opts.state_dir,
        baselineSnapshot: opts.baseline,
        baselineSource: opts.baseline_source,
        include: opts.include,
        exclude: opts.exclude,
        maxChangedFiles: opts.maxChangedFiles,
        metadata: opts.metadata,
      });
    } else if (opts.command === 'show') {
      result = await showLatestDeployReceipt({ root: opts.root, stateDir: opts.state_dir });
    } else {
      result = await finalizeDeployReceipt({
        root: opts.root,
        stateDir: opts.state_dir,
        status: opts.command === 'success' ? 'success' : 'failed',
        deploymentId: opts.deployment_id,
        workerVersionId: opts.worker_version,
        metadata: opts.metadata,
      });
    }
    const output = result?.receipt || result;
    if (opts.json) process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    else process.stdout.write(human(result, opts.command));
    return result;
  } catch (error) {
    process.exitCode = 2;
    const json = argv.includes('--json');
    process.stderr.write(json ? JSON.stringify({ error: error.message }) + '\n' : `Deploy receipt: ${error.message}\n`);
  }
}
