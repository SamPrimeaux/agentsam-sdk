import fs from 'node:fs';
import { scanProjectSecurity, reportExitCode, repairProject, formatSecurityReport } from '../security/index.js';
import { runProcess } from '../security/process.js';

const help = [
  'Agent Sam · dependency health',
  '  agentsam security scan [--path DIR] [--offline] [--json]',
  '  agentsam security check --log FILE [--path DIR] [--json]',
  '  agentsam security run [--path DIR] [--json] -- COMMAND ARGS...',
  '  agentsam security repair [--path DIR] [--log FILE] [--apply] [--verify SCRIPT] [--json]',
  '  agentsam sca ...                 alias',
  '',
  'scan/check: exact npm lockfile versions, full OSV advisories, deprecations and log triage.',
  'run: execute an explicitly supplied install/build command, then check its logs and dependencies.',
  'repair: plan by default; --apply updates an isolated Git worktree, installs, verifies and rescans.',
  'Online lookup sends package names/versions to OSV, never source code or deployment logs.',
  'Offline is inventory only and exits 2. pnpm/Yarn/Bun graphs are explicitly unsupported.',
  'Exit: 0 clean/verified, 1 unresolved findings or command failure, 2 incomplete/error.',
  ''
].join('\n');
export async function runSecurity(argv) {
  const ownArgs = argv.slice(0, argv.indexOf('--') < 0 ? argv.length : argv.indexOf('--'));
  if (ownArgs.includes('--help') || ownArgs.includes('-h') || !argv.length) { process.stdout.write(help); return; }
  const command = argv[0], options = { json: argv.slice(0, argv.indexOf('--') < 0 ? argv.length : argv.indexOf('--')).includes('--json') }, booleans = new Map([['--offline','offline'],['--json','json'],['--apply','apply']]);
  let childArgs;
  try {
    if (!['scan','check','repair','run'].includes(command)) throw new Error('Unknown security command');
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--') { childArgs = argv.slice(i + 1); break; }
      if (booleans.has(arg)) options[booleans.get(arg)] = true;
      else if (['--path','--log','--verify'].includes(arg)) {
        const value = argv[++i];
        if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg);
        options[{ '--path':'projectRoot','--log':'logFile','--verify':'verify' }[arg]] = value;
      } else throw new Error('Unknown security option: ' + arg);
    }
    if (options.apply && command !== 'repair') throw new Error('--apply is only valid for repair');
    if (options.verify && command !== 'repair') throw new Error('--verify is only valid for repair');
    if (options.offline && !['scan','check'].includes(command)) throw new Error('run and repair require an online scan');
    if (childArgs && command !== 'run') throw new Error('Command arguments require security run');
    if (command === 'run' && !childArgs?.length) throw new Error('Use security run -- COMMAND ARGS');
    if (command === 'check' && !options.logFile) throw new Error('check requires --log FILE');
    if (options.logFile) {
      const stat = fs.lstatSync(options.logFile);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('Log must be a regular file under 8 MiB');
      options.log = fs.readFileSync(options.logFile, 'utf8');
    }
    const controller = new AbortController();
    options.signal = controller.signal;
    const abort = () => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    let report;
    try {
      if (command === 'run') {
        const result = await runProcess(childArgs[0], childArgs.slice(1), { cwd: options.projectRoot || process.cwd(), signal: options.signal });
        report = await scanProjectSecurity({ ...options, log: result.stdout + '\n' + result.stderr });
        report.command_exit_code = result.code;
        if (result.code) { report.ok = false; report.status = 'command-failed'; }
      } else report = command === 'repair' ? await repairProject(options) : await scanProjectSecurity(options);
    } finally {
      process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    }
    process.stdout.write(options.json ? JSON.stringify(report, null, 2) + '\n' : formatSecurityReport(report, { color: Boolean(process.stdout.isTTY && !process.env.NO_COLOR) }));
    process.exitCode = reportExitCode(report);
  } catch {
    const report = { schema_version: 1, ok: false, complete: false, status: 'error', error: 'Security operation failed. Check command options, manifest/log validity, network access, and Git prerequisites. Use --help.' };
    process.stdout.write(options.json ? JSON.stringify(report) + '\n' : report.error + '\n');
    process.exitCode = 2;
  }
}
