import { assessContextUsage, compactContextItem, createContextBudget, estimateContextTokens, rehydrateContextRef, resolveContext } from '../context/index.js';
import { calculateModelCost, getModelRecord } from '../models/index.js';
import { hydrateToolSchemas, searchToolCards } from '../tools/index.js';

const STRATEGIES = Object.freeze(['bounded', 'discovery', 'compact']);

const BASE_TOOLS = Object.freeze([
  { name: 'repository.snapshot', description: 'Inspect repository identity, tree, packages, and structural evidence.', category: 'repository', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
  { name: 'code.symbols', description: 'Find exact symbols, declarations, imports, and callers in indexed source.', category: 'code', input_schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } },
  { name: 'files.read', description: 'Read a selected file or bounded source range by stable reference.', category: 'files', input_schema: { type: 'object', required: ['ref'], properties: { ref: { type: 'string' } } } },
  { name: 'tests.trace', description: 'Trace a failing test to referenced source symbols and files.', category: 'tests', input_schema: { type: 'object', required: ['test'], properties: { test: { type: 'string' } } } },
  { name: 'context.rehydrate', description: 'Recover previously compacted evidence by stable reference and hash.', category: 'context', input_schema: { type: 'object', required: ['ref'], properties: { ref: { type: 'string' } } } },
  ...Array.from({ length: 20 }, (_, index) => ({ name: `misc.tool.${index}`, description: `Unrelated generic capability ${index}.`, category: 'misc', input_schema: { type: 'object', properties: {} } })),
]);

const FIXTURES = Object.freeze({
  'exact-symbol-callers': {
    task: 'Find the exact resolveContext implementation and its budget dependency before changing context selection.',
    required: ['file:src/context/resolve.js', 'file:src/context/budget.js'],
    syntheticBaseTokens: 8_000,
    items: [
      { ref: 'file:src/context/resolve.js', kind: 'file', priority: 100, content: 'resolveContext selects evidence, computes receipt composition, and defers overflow refs.'.repeat(40) },
      { ref: 'file:src/context/budget.js', kind: 'file', priority: 95, content: 'createContextBudget separates model capacity from AgentSam working-set policy.'.repeat(36) },
      { ref: 'file:README.md', kind: 'file', priority: 8, content: 'General product documentation.'.repeat(100) },
      { ref: 'file:apps/local-studio/theme.css', kind: 'file', priority: 1, content: 'Unrelated visual styles.'.repeat(160) },
    ],
  },
  'two-file-repair': {
    task: 'Repair a shell model-control regression spanning CLI preferences and slash dispatch without loading unrelated apps.',
    required: ['file:src/lib/cli-preferences.js', 'file:src/commands/shell.js'],
    syntheticBaseTokens: 14_000,
    items: [
      { ref: 'file:src/lib/cli-preferences.js', kind: 'file', priority: 100, content: 'CLI preference schema and persistence.'.repeat(90) },
      { ref: 'file:src/commands/shell.js', kind: 'file', priority: 98, content: 'Slash command parsing, runtime cwd, model and context controls.'.repeat(120) },
      { ref: 'file:apps/cad-creator/frontend/app.tsx', kind: 'file', priority: 5, content: 'CAD UI.'.repeat(300) },
      { ref: 'file:docs/identity.md', kind: 'file', priority: 4, content: 'Identity docs.'.repeat(240) },
    ],
  },
  'config-without-runtime-pollution': {
    task: 'Update portable project defaults while keeping account, run, connection, and execution state out of committed config.',
    required: ['file:.agentsam/config.json', 'file:src/lib/cli-preferences.js'],
    syntheticBaseTokens: 10_000,
    items: [
      { ref: 'file:.agentsam/config.json', kind: 'file', priority: 100, content: 'Portable repository identity and defaults only.'.repeat(90) },
      { ref: 'file:src/lib/cli-preferences.js', kind: 'file', priority: 90, content: 'Gitignored per-machine model, runtime, terminal, and trust preferences.'.repeat(85) },
      { ref: 'memory:run-history', kind: 'memory', priority: 3, content: 'Large hosted run history must not be copied into project config.'.repeat(500), consumed: true },
    ],
  },
  'trace-failing-test': {
    task: 'Trace a failing shell regression test to the exact implementation and fix only the implicated source.',
    required: ['file:test/shell.test.mjs', 'file:src/commands/shell.js'],
    syntheticBaseTokens: 22_000,
    items: [
      { ref: 'file:test/shell.test.mjs', kind: 'file', priority: 100, content: 'Regression assertions for slash dispatch and runtime cwd.'.repeat(110) },
      { ref: 'file:src/commands/shell.js', kind: 'file', priority: 96, content: 'Command implementation under test.'.repeat(140) },
      { ref: 'file:test/cad.test.mjs', kind: 'file', priority: 2, content: 'Unrelated CAD tests.'.repeat(240) },
    ],
  },
  'contradictory-paths': {
    task: 'Detect two contradictory model-selection paths and choose one canonical runtime preference path.',
    required: ['file:src/commands/models.js', 'file:src/commands/preferences.js', 'file:src/lib/cli-preferences.js'],
    syntheticBaseTokens: 36_000,
    items: [
      { ref: 'file:src/commands/models.js', kind: 'file', priority: 100, content: 'Provider model discovery and availability proof.'.repeat(105) },
      { ref: 'file:src/commands/preferences.js', kind: 'file', priority: 98, content: 'Interactive model, reasoning, and processing selection.'.repeat(100) },
      { ref: 'file:src/lib/cli-preferences.js', kind: 'file', priority: 96, content: 'Canonical local preference persistence.'.repeat(90) },
      { ref: 'file:legacy/model-picker.js', kind: 'file', priority: 15, content: 'Legacy duplicate picker path that should not become a second authority.'.repeat(200), consumed: true },
    ],
  },
  'continuation-after-compaction': {
    task: 'Continue a long tool-heavy run by compacting consumed evidence and rehydrating the exact result needed for the next step.',
    required: ['tool:call_previous', 'file:src/context/compact.js'],
    syntheticBaseTokens: 174_000,
    items: [
      { ref: 'tool:call_previous', kind: 'tool_result', priority: 100, content: 'Critical prior tool evidence with stable identity and the exact invariant required later. '.repeat(900), consumed: true },
      { ref: 'file:src/context/compact.js', kind: 'file', priority: 95, content: 'Compaction preserves ref hash and source size while shrinking active context.'.repeat(100) },
      { ref: 'file:unrelated/generated.log', kind: 'file', priority: 1, content: 'Noisy old generated log.'.repeat(500), consumed: true },
    ],
  },
});

function budgetFor(record) {
  const p = record.context_policy;
  return createContextBudget({ windowTokens: record.context_window, targetInputTokens: p.target_input_tokens, compactAtTokens: p.compact_at_tokens, interveneAtTokens: p.intervene_at_tokens, maxNormalInputTokens: p.max_normal_input_tokens, pricingThresholdTokens: p.pricing_threshold_tokens, safetyMarginTokens: p.safety_margin_tokens });
}

function fixture(name) {
  const value = FIXTURES[name];
  if (!value) throw new Error(`unknown context eval fixture: ${name}`);
  return value;
}

async function runStrategy(fx, strategy, record) {
  const budget = budgetFor(record);
  let items = fx.items.map(item => ({ ...item }));
  let compactedChars = 0;
  const sources = new Map(items.map(item => [item.ref, item]));
  const rehydratedRefs = [];

  if (strategy === 'compact') {
    items = items.map(item => {
      if (!item.consumed) return item;
      const compacted = compactContextItem(item, { maxChars: 4_000 });
      compactedChars += Math.max(0, item.content.length - compacted.content.length);
      return compacted;
    });
  }

  const tools = strategy === 'bounded' ? { cards: [], receipt: { returned_items: 0, chars: 0 } } : searchToolCards(BASE_TOOLS, fx.task, { maxItems: 8 });
  const hydrated = strategy === 'bounded' ? { tools: [], receipt: { hydrated_tools: 0, schema_chars: 0 } } : hydrateToolSchemas(BASE_TOOLS, tools.cards.map(card => card.tool), { maxTools: 8, maxChars: 40_000 });
  let pack = resolveContext({ objective: fx.task, budget, toolSchemaChars: hydrated.receipt.schema_chars, items });
  const selectedRefs = new Set(pack.items.map(item => item.ref));

  if (strategy === 'compact') {
    for (const ref of fx.required) {
      const selected = pack.items.find(item => item.ref === ref);
      if (!selected?.compacted) continue;
      const source = sources.get(ref);
      const rehydrated = await rehydrateContextRef(ref, async () => source, { kind: source.kind, maxChars: budget.maxFileCharsPerRead });
      const remaining = pack.items.filter(item => item.ref !== ref);
      remaining.push({ ...rehydrated, priority: source.priority });
      pack = resolveContext({ objective: fx.task, budget, toolSchemaChars: hydrated.receipt.schema_chars, items: remaining });
      selectedRefs.add(ref);
      rehydratedRefs.push(ref);
    }
  }

  const missingRequired = fx.required.filter(ref => !selectedRefs.has(ref));
  const evidenceTokens = pack.receipt.estimated_input_tokens;
  const activeTokens = fx.syntheticBaseTokens + evidenceTokens;
  const pressure = assessContextUsage(activeTokens, budget);
  const inputCost = calculateModelCost(record, { input_tokens: activeTokens, output_tokens: 0 }, { serviceTier: 'default' });
  return Object.freeze({
    strategy,
    result: missingRequired.length ? 'FAIL' : 'PASS',
    required_evidence: fx.required.length,
    required_found: fx.required.length - missingRequired.length,
    missing_required: Object.freeze(missingRequired),
    sources_considered: pack.receipt.sources_considered,
    sources_selected: pack.receipt.sources_included,
    sources_deferred: pack.receipt.sources_deferred,
    tool_cards: tools.receipt.returned_items,
    tool_card_chars: tools.receipt.chars,
    hydrated_tools: hydrated.receipt.hydrated_tools,
    tool_schema_chars: hydrated.receipt.schema_chars,
    compacted_chars: compactedChars,
    rehydrated_refs: Object.freeze(rehydratedRefs),
    active_context_tokens: activeTokens,
    evidence_tokens: evidenceTokens,
    window_tokens: budget.windowTokens,
    pricing_threshold_tokens: budget.pricingThresholdTokens,
    tokens_until_pricing_threshold: pressure.tokensUntilPricingThreshold,
    pressure: pressure.stage,
    should_compact: pressure.shouldCompact,
    estimated_input_cost_usd: inputCost.total_usd,
    estimate_kind: 'local',
  });
}

function rank(results) {
  return [...results].sort((a, b) => {
    if (a.result !== b.result) return a.result === 'PASS' ? -1 : 1;
    if (a.required_found !== b.required_found) return b.required_found - a.required_found;
    if (a.active_context_tokens !== b.active_context_tokens) return a.active_context_tokens - b.active_context_tokens;
    return a.tool_schema_chars - b.tool_schema_chars;
  });
}

export function listContextEvalFixtures() { return Object.keys(FIXTURES); }

export async function evaluateContextFixture(options = {}) {
  const name = options.fixture || 'exact-symbol-callers';
  const fx = fixture(name);
  const record = getModelRecord(options.model || 'gpt-6-astra');
  if (!record) throw new Error(`unknown model: ${options.model}`);
  const strategies = options.strategy && options.strategy !== 'all' ? [options.strategy] : STRATEGIES;
  for (const strategy of strategies) if (!STRATEGIES.includes(strategy)) throw new Error(`unknown context strategy: ${strategy}`);
  const results = [];
  for (const strategy of strategies) results.push(await runStrategy(fx, strategy, record));
  const ranked = rank(results);
  return Object.freeze({
    schema_version: 1,
    fixture: name,
    task: fx.task,
    model: record.provider_model_id,
    live_provider_used: false,
    strategies: Object.freeze(results),
    winner: ranked[0]?.strategy || null,
    scoring: Object.freeze(['correctness', 'required_evidence', 'context_efficiency', 'tool_efficiency']),
  });
}
