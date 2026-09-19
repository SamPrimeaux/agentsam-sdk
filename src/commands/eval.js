import {
  evaluateContextFixture,
  finishLiveEvalRun,
  getLiveEvalStatus,
  listContextEvalFixtures,
  startLiveEvalRun,
} from '../eval/index.js';

function parse(argv) {
  let subcommand = argv[0] || '';
  let help = false;
  if (subcommand === '--help' || subcommand === '-h') {
    help = true;
    subcommand = '';
  }
  const action = argv[1] || '';
  const out = {
    subcommand,
    action,
    fixture: '',
    strategy: 'all',
    model: '',
    provider: '',
    client: '',
    reasoning: 'high',
    suite: '',
    case: '',
    gate: '',
    remote: false,
    json: false,
    list: false,
    help,
  };

  const startIndex = subcommand === 'live' ? 2 : 1;
  for (let i = startIndex; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture') out.fixture = argv[++i] || '';
    else if (arg === '--strategy') out.strategy = argv[++i] || 'all';
    else if (arg === '--model') out.model = argv[++i] || '';
    else if (arg === '--provider') out.provider = argv[++i] || '';
    else if (arg === '--client') out.client = argv[++i] || '';
    else if (arg === '--reasoning') out.reasoning = argv[++i] || 'high';
    else if (arg === '--suite') out.suite = argv[++i] || '';
    else if (arg === '--case') out.case = argv[++i] || '';
    else if (arg === '--gate') out.gate = argv[++i] || '';
    else if (arg === '--remote') out.remote = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--list') out.list = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown eval option: ${arg}`);
  }
  return out;
}

function renderContextReport(report) {
  const rows = [
    '',
    '  AgentSam · Context Eval',
    '',
    `  fixture          ${report.fixture}`,
    `  model            ${report.model}`,
    `  provider call    no · deterministic/offline`,
    '',
  ];
  for (const row of report.strategies) {
    rows.push(`  ${row.strategy.toUpperCase()}`);
    rows.push(`    result           ${row.result}`);
    rows.push(`    evidence         ${row.required_found} / ${row.required_evidence} required · ${row.sources_selected} / ${row.sources_considered} selected`);
    rows.push(`    active context   ~${row.active_context_tokens.toLocaleString('en-US')}`);
    rows.push(`    window           ${row.window_tokens.toLocaleString('en-US')}`);
    rows.push(`    price threshold  ${row.pricing_threshold_tokens.toLocaleString('en-US')}`);
    rows.push(`    remaining        ${row.tokens_until_pricing_threshold.toLocaleString('en-US')}`);
    rows.push(`    tool schemas     ${row.hydrated_tools} · ${row.tool_schema_chars.toLocaleString('en-US')} chars`);
    rows.push(`    compacted        ${row.compacted_chars.toLocaleString('en-US')} chars`);
    rows.push(`    rehydrated       ${row.rehydrated_refs.length ? row.rehydrated_refs.join(', ') : 'none'}`);
    rows.push(`    est input cost   $${row.estimated_input_cost_usd.toFixed(4)}`);
    rows.push('');
  }
  rows.push(`  winner           ${report.winner}`);
  rows.push(`  scoring          ${report.scoring.join(' → ')}`);
  rows.push('');
  return rows.join('\n');
}

function renderLiveHelp() {
  return `
  AgentSam · Live Agent Evaluation

  Usage:
    agentsam eval live start --case <id> [--suite <id>] [--model <name>] [--provider <name>] [--client <client>] [--reasoning <high|medium|low>]
    agentsam eval live status [--json]
    agentsam eval live finish [--gate PASS|FAIL] [--remote] [--json]

  Examples:
    agentsam eval live start --suite sdk-real-work-20260919 --case cad-shell-unification --client cursor --model "Muse Spark 1.3"
    agentsam eval live finish --gate PASS --remote
`;
}

export async function runEval(argv = [], options = {}) {
  const args = parse(argv);
  const write = options.write || ((text) => process.stdout.write(text));

  if (args.help || (!args.subcommand && !argv.length)) {
    write('agentsam eval context --fixture <name> [--strategy bounded|discovery|compact|all] [--model gpt-6-astra] [--json]\n');
    write('agentsam eval live <start|status|finish> [options]\n');
    return null;
  }

  if (args.subcommand === 'live') {
    const action = args.action || 'status';

    if (args.help || !action) {
      write(renderLiveHelp());
      return null;
    }

    if (action === 'start') {
      const run = startLiveEvalRun(
        {
          suite: args.suite,
          case: args.case,
          model: args.model,
          provider: args.provider,
          client: args.client,
          reasoning: args.reasoning,
        },
        options
      );

      if (args.json) {
        write(JSON.stringify(run, null, 2) + '\n');
        return run;
      }

      write(`\n  ✓ Started live eval run: ${run.run_id}\n`);
      write(`      Suite:      ${run.suite_id}\n`);
      write(`      Case:       ${run.case_id}\n`);
      write(`      Model:      ${run.model} (${run.reasoning} reasoning)\n`);
      write(`      Client:     ${run.client} (${run.provider})\n`);
      write(`      Base Git:   ${run.base_commit.slice(0, 7) || 'clean'} on ${run.branch || 'main'}\n`);
      write(`      Started:    ${run.started_at}\n\n`);
      return run;
    }

    if (action === 'status') {
      const status = getLiveEvalStatus(options);
      if (args.json) {
        write(JSON.stringify(status, null, 2) + '\n');
        return status;
      }

      if (!status.active) {
        write('  No live evaluation run currently in progress.\n');
        return status;
      }

      const elapsedSec = (status.elapsed_ms / 1000).toFixed(1);
      write(`\n  Live Eval In Progress · ${status.run_id}\n`);
      write(`      Case:       ${status.case_id} (${status.suite_id})\n`);
      write(`      Model:      ${status.model} [${status.client}]\n`);
      write(`      Elapsed:    ${elapsedSec}s\n`);
      write(`      Tool calls: ${status.receipts_summary?.tool_call_count || 0} (${status.receipts_summary?.mcp_call_count || 0} MCP)\n\n`);
      return status;
    }

    if (action === 'finish') {
      const result = await finishLiveEvalRun({
        ...options,
        gate: args.gate,
        remote: args.remote,
      });

      if (args.json) {
        write(JSON.stringify(result, null, 2) + '\n');
        return result;
      }

      const s = result.summary;
      const elapsedMin = (s.elapsed_ms / 60000).toFixed(1);

      write(`\n  AgentSam Live Eval Summary\n`);
      write(`  ────────────────────────────────────────────────────────────\n`);
      write(`  Model:             ${s.model} (${s.reasoning || 'high'})\n`);
      write(`  Case:              ${s.case_id} (${s.suite_id})\n`);
      write(`  Run ID:            ${result.evalRunRow.id}\n`);
      write(`  Elapsed:           ${elapsedMin}m (${(s.elapsed_ms / 1000).toFixed(1)}s)\n`);
      write(`  Files changed:     ${s.files_changed} (+${s.insertions} / -${s.deletions})\n`);
      write(`  Tool calls:        ${s.tool_call_count} total\n`);
      write(`    • MCP calls:     ${s.mcp_call_count}\n`);
      write(`    • Terminal:      ${s.terminal_call_count}\n`);
      write(`    • GitHub:        ${s.github_call_count}\n`);
      write(`    • D1 / Database: ${s.d1_call_count}\n`);
      write(`    • Retries:       ${s.failure_count}\n`);
      write(`  Gate status:       ${s.gate_status}\n`);
      write(`  Commit:            ${s.head_commit?.slice(0, 7) || 'N/A'}\n`);
      if (s.d1_executed) {
        write(`  D1 Record:         ✓ Recorded to inneranimalmedia-business\n`);
      } else if (s.d1_error) {
        write(`  D1 Record:         ⚠ Error: ${s.d1_error}\n`);
      } else {
        write(`  D1 Record:         ○ Local only (use --remote to push)\n`);
      }
      write(`  ────────────────────────────────────────────────────────────\n\n`);
      return result;
    }

    throw new Error(`unknown live eval action: ${action}`);
  }

  if (args.subcommand === 'context') {
    if (args.list) {
      const value = { fixtures: listContextEvalFixtures() };
      write(args.json ? `${JSON.stringify(value)}\n` : `${value.fixtures.join('\n')}\n`);
      return value;
    }
    const report = await evaluateContextFixture({
      fixture: args.fixture || 'exact-symbol-callers',
      strategy: args.strategy,
      model: args.model || 'gpt-6-astra',
    });
    write(args.json ? `${JSON.stringify(report)}\n` : renderContextReport(report));
    return report;
  }

  throw new Error(`unknown eval subcommand: ${args.subcommand}`);
}
