import {
  collectCredentialsAudit,
  renderCredentialsAudit,
} from '../lib/credentials-audit.js';
import {
  remediateProviderFailure,
  renderRemediationCard,
  recommendedCommand,
} from '../lib/provider-command-remediation.js';

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function parseArgs(argv = []) {
  const out = {
    action: 'audit',
    json: false,
    verify: false,
    drift: true,
    namesOnly: false,
    noNetwork: false,
    help: false,
    remediateArgv: [],
  };
  const args = [...argv];
  if (!args.length || args[0] === 'audit') {
    if (args[0] === 'audit') args.shift();
    out.action = 'audit';
  } else if (args[0] === 'remediate') {
    out.action = 'remediate';
    args.shift();
  } else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    out.help = true;
    return out;
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--verify') out.verify = true;
    else if (arg === '--drift') out.drift = true;
    else if (arg === '--no-drift') out.drift = false;
    else if (arg === '--names-only') out.namesOnly = true;
    else if (arg === '--no-network') out.noNetwork = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--') continue;
    else if (out.action === 'remediate') out.remediateArgv.push(arg);
    else throw new Error(`unknown credentials option: ${arg}`);
  }
  return out;
}

function printHelp(write = (s) => process.stdout.write(s)) {
  writeLine(write, '');
  writeLine(write, '  agentsam credentials audit [--verify] [--drift] [--names-only] [--no-network] [--json]');
  writeLine(write, '  agentsam credentials remediate -- <provider argv…>');
  writeLine(write, '');
  writeLine(write, '  Never prints secret values. Prefer --names-only for shareable receipts.');
  writeLine(write, '  Example remediation fixture:');
  writeLine(write, '    agentsam credentials remediate -- gcloud edge-cloud service-accounts keys create');
  writeLine(write, '');
}

export async function runCredentials(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp(write);
    return 0;
  }

  if (parsed.action === 'remediate') {
    const card = remediateProviderFailure({
      argv: parsed.remediateArgv,
      env: options.env || process.env,
      projectId: options.projectId,
    });
    if (!card) {
      writeLine(write, '');
      writeLine(write, '  No deterministic remediation matched that failure yet.');
      writeLine(write, '  Tip: agentsam cheat-sheet · agentsam credentials audit --verify --drift');
      writeLine(write, '');
      return 1;
    }
    if (parsed.json) {
      write(JSON.stringify({ ...card, recommended_command: recommendedCommand(card) }, null, 2) + '\n');
    } else {
      write(renderRemediationCard(card));
      const cmd = recommendedCommand(card);
      if (cmd) writeLine(write, `  Recommended copy:\n    ${cmd}\n`);
    }
    return 0;
  }

  const report = await collectCredentialsAudit({
    env: options.env || process.env,
    home: options.home,
    verify: parsed.verify,
    drift: parsed.drift,
    namesOnly: parsed.namesOnly,
    noNetwork: parsed.noNetwork || !parsed.verify,
  });

  if (parsed.json) {
    write(JSON.stringify(report, null, 2) + '\n');
  } else {
    write(renderCredentialsAudit(report));
    for (const card of report.remediations || []) {
      write(renderRemediationCard(card));
    }
  }

  const high = (report.drift || []).some((row) => row.severity === 'high');
  return high ? 2 : 0;
}
