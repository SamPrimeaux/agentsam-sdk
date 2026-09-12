import { evaluateContextFixture, listContextEvalFixtures } from '../eval/index.js';

function parse(argv) {
  const out = { subcommand: argv[0] || '', fixture: '', strategy: 'all', model: 'gpt-6-astra', json: false, list: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture') out.fixture = argv[++i] || '';
    else if (arg === '--strategy') out.strategy = argv[++i] || 'all';
    else if (arg === '--model') out.model = argv[++i] || 'gpt-6-astra';
    else if (arg === '--json') out.json = true;
    else if (arg === '--list') out.list = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown eval option: ${arg}`);
  }
  return out;
}

function render(report) {
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

export async function runEval(argv = [], options = {}) {
  const args = parse(argv);
  const write = options.write || (text => process.stdout.write(text));
  if (args.help || args.subcommand !== 'context') {
    write('agentsam eval context --fixture <name> [--strategy bounded|discovery|compact|all] [--model gpt-6-astra] [--json]\n');
    return null;
  }
  if (args.list) {
    const value = { fixtures: listContextEvalFixtures() };
    write(args.json ? `${JSON.stringify(value)}\n` : `${value.fixtures.join('\n')}\n`);
    return value;
  }
  const report = await evaluateContextFixture({ fixture: args.fixture || 'exact-symbol-callers', strategy: args.strategy, model: args.model });
  write(args.json ? `${JSON.stringify(report)}\n` : render(report));
  return report;
}
