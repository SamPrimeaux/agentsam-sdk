import path from 'node:path';
import { readSnapshot } from '../lib/merkle/snapshot.js';
import {
  buildMerklePersistencePlan,
  persistMerkleSnapshotCloudflare,
  resolveWranglerMerklePersistence,
} from '../lib/merkle/cloudflare-persistence.js';

function value(args, index, flag) {
  const next = args[index + 1];
  if (!next || next.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return next;
}

export function printMerklePersistHelp() {
  console.log(`
  agentsam merkle persist <snapshot.json> — publish a saved Merkle snapshot through host bindings

  --wrangler-config <file>    Worker config containing WEBSITE_ASSETS and optionally DB
  --account-id <id>           Authenticated account authority (or AGENTSAM_ACCOUNT_ID)
  --repository-id <id>        Canonical code_repositories.id; never inferred from Git remotes
  --capture-kind <kind>       deploy|manual|agent|index (default manual)
  --connection-id <id>        Execution provenance for non-deploy captures
  --runtime-lease-id <id>     Alternative execution provenance for non-deploy captures
  --deployment-id <id>        Optional deployment linkage
  --worker-version <id>       Optional provider worker version linkage
  --reference-label <label>   Optional human/audit label
  --source <source>           github|gitlab|bitbucket|local|upload (default local)
  --prefix <prefix>           Object prefix (default agentsam_fs_merkle_snapshots)
  --r2-binding <name>         Logical R2 role (default WEBSITE_ASSETS)
  --d1-binding <name>         Logical D1 role (default DB)
  --environment <name>        Wrangler environment
  --wrangler-bin <path>       Wrangler executable (default WRANGLER_BIN or wrangler)
  --r2-only                   Upload object without indexing in D1
  --dry-run                   Resolve bindings and emit the exact storage/index plan without writes
  --json                      Machine-readable output

  The SDK never infers account or repository authority. Hosts must pass authenticated account_id
  and the canonical repository_id from their repository registry. Physical bucket/database names
  come from Wrangler bindings, so customer installs keep
  WEBSITE_ASSETS/DB while selecting their own storage resources.
`);
}

function parse(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) return { help: true };
  const opts = {
    snapshotPath: '', json: false, dryRun: false, r2Only: false,
    captureKind: 'manual', source: 'local', r2Binding: 'WEBSITE_ASSETS', d1Binding: 'DB',
    storagePrefix: 'agentsam_fs_merkle_snapshots',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('-') && !opts.snapshotPath) { opts.snapshotPath = arg; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (arg === '--r2-only') { opts.r2Only = true; continue; }
    const map = {
      '--wrangler-config': 'wranglerConfig', '--account-id': 'accountId', '--repository-id': 'repositoryId',
      '--capture-kind': 'captureKind', '--connection-id': 'connectionId', '--runtime-lease-id': 'runtimeLeaseId',
      '--deployment-id': 'deploymentId', '--worker-version': 'workerVersionId', '--reference-label': 'referenceLabel',
      '--source': 'source', '--prefix': 'storagePrefix', '--r2-binding': 'r2Binding', '--d1-binding': 'd1Binding',
      '--environment': 'environment', '--wrangler-bin': 'wranglerBin', '--root': 'root',
    };
    if (map[arg]) { opts[map[arg]] = value(args, i, arg); i += 1; continue; }
    throw new Error(`Unknown merkle persist option: ${arg}`);
  }
  if (!opts.snapshotPath) throw new Error('snapshot_file_required');
  opts.accountId ||= process.env.AGENTSAM_ACCOUNT_ID || '';
  opts.repositoryId ||= process.env.AGENTSAM_REPOSITORY_ID || '';
  opts.wranglerConfig ||= process.env.AGENTSAM_WRANGLER_CONFIG || '';
  opts.connectionId ||= process.env.AGENTSAM_CONNECTION_ID || '';
  opts.runtimeLeaseId ||= process.env.AGENTSAM_RUNTIME_LEASE_ID || '';
  return opts;
}

export async function runMerklePersist(args = []) {
  const opts = parse(args);
  if (opts.help) { printMerklePersistHelp(); return null; }
  const snapshotPath = path.resolve(opts.snapshotPath);
  const snapshot = await readSnapshot(snapshotPath);
  const root = path.resolve(opts.root || snapshot.rootPath || process.cwd());
  const wrangler = resolveWranglerMerklePersistence({
    configPath: opts.wranglerConfig,
    environment: opts.environment || null,
    r2Binding: opts.r2Binding,
    d1Binding: opts.d1Binding,
    r2Only: opts.r2Only,
  });
  const plan = buildMerklePersistencePlan({
    snapshot,
    root,
    accountId: opts.accountId,
    repositoryId: opts.repositoryId,
    source: opts.source,
    captureKind: opts.captureKind,
    connectionId: opts.connectionId,
    runtimeLeaseId: opts.runtimeLeaseId,
    deploymentId: opts.deploymentId,
    workerVersionId: opts.workerVersionId,
    referenceLabel: opts.referenceLabel,
    storagePrefix: opts.storagePrefix,
    wrangler,
  });
  const result = persistMerkleSnapshotCloudflare({
    snapshotPath,
    snapshot,
    plan,
    wranglerBin: opts.wranglerBin,
    r2Only: opts.r2Only,
    dryRun: opts.dryRun,
  });
  if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    console.log(`Persisted ${result.snapshot_id}${result.dry_run ? ' (dry run)' : ''}`);
    console.log(`  R2   ${result.binding} -> ${result.storage_bucket}/${result.storage_key}`);
    if (result.table) console.log(`  D1   ${result.database_binding} -> ${result.database_name}.${result.table}`);
  }
  return result;
}
