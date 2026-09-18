import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { confirm, isCancel, select } from '@clack/prompts';
import { SLASH_COMMANDS, SHELL_PHASES } from '../lib/slash-commands.js';
import { runContext } from './context.js';
import { runDb } from './db.js';
import { runDeploy } from './deploy.js';
import { runStatus } from './status.js';
import { runModels } from './models.js';
import { configureCliPreferences } from './preferences.js';
import { runCloudflare } from './cloudflare.js';
import { createRuntimeActivity } from '../ui/runtime-activity.js';
import { diagnosticFromError, renderDiagnosticError } from '../errors/index.js';
import { getModelRecord } from '../models/index.js';
import { readCliPreferences, updateCliPreferences } from '../lib/cli-preferences.js';
import { buildContextEconomicsReport, renderContextEconomics } from './context-economics.js';
import { createOpenAIResponsesAdapter } from '../providers/index.js';
import { createCapabilityAdapter, runResponsesAgent } from '../agent/index.js';
import { resolveProviderCredential } from '../lib/provider-credentials.js';
import { createLocalSession, saveLocalSession, sessionTitleFromInput } from '../lib/local-sessions.js';
import { grantExecutionApproval, isExecutionApproved, toolApprovalKey } from '../lib/execution-approvals.js';
import { runWhoami } from './whoami.js';
import { runLogin, runLogout } from './account-auth.js';
import { runHelp } from '../ui/cli/help.js';

function writeLine(write, value = '') { write(`${value}\n`); }

export function compactCwd(value, home = process.env.HOME || process.env.USERPROFILE || '') {
  const cwd = path.resolve(value);
  const resolvedHome = home ? path.resolve(home) : '';
  if (!resolvedHome) return cwd;
  if (cwd === resolvedHome) return '~';
  return cwd.startsWith(`${resolvedHome}${path.sep}`) ? `~${cwd.slice(resolvedHome.length)}` : cwd;
}

export function shellUsername(env = process.env) {
  const fromEnv = String(env.USER || env.USERNAME || '').trim();
  if (fromEnv) return fromEnv;
  try { return String(os.userInfo().username || '').trim() || 'user'; }
  catch { return 'user'; }
}

export function renderShellPrompt(cwd, env = process.env) {
  return `${shellUsername(env)} ${compactCwd(cwd, env.HOME || env.USERPROFILE || '')} > `;
}

export function tokenizeShellLine(input = '') {
  const source = String(input);
  const tokens = [];
  let token = '';
  let quote = '';
  let started = false;
  const flush = () => {
    if (!started) return;
    tokens.push(token);
    token = '';
    started = false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = '';
      else token += ch;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    token += ch;
    started = true;
  }
  flush();
  return tokens;
}

export function renderShellCatalog() {
  const next = SHELL_PHASES.find((phase) => phase.status === 'next' || phase.status === 'current');
  const rows = SLASH_COMMANDS.map((row) => `    ${row.cmd.padEnd(14)} ${row.description}`).join('\n');
  return `
  ╔════════════════════════════════╗
  ║        Agent Sam Terminal      ║
  ╚════════════════════════════════╝

  Current milestone: ${next?.label ?? 'interactive runtime'}
  Type / and press Enter for the scrollable command picker.

  Slash commands (${SLASH_COMMANDS.length} implemented):
${rows}
`;
}

function parseDeployOptions(args, cwd) {
  const opts = { cwd, target: '', accountId: '' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--target') opts.target = args[++i] || '';
    else if (arg === '--account-id') opts.accountId = args[++i] || '';
    else throw new Error(`unknown /deploy option: ${arg}`);
  }
  return opts;
}

function spawnGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git exited ${result.status}`);
}

function selectedModel(cwd) {
  const preferences = readCliPreferences(cwd) || {};
  const model = getModelRecord(preferences.modelPreference);
  if (!model) throw new Error('Select an exact provider-verified model with /model first so Agent Sam can verify supported runtime controls.');
  return { preferences, model };
}

async function chooseReasoning(cwd, args, state) {
  const { preferences, model } = selectedModel(cwd);
  let effort = String(args[0] || '').trim().toLowerCase();
  if (!effort) {
    if (!state.interactive) {
      writeLine(state.write, `  ${model.provider_model_id} reasoning: ${model.reasoning_efforts.join(' | ')}`);
      writeLine(state.write, `  current: ${preferences.reasoningEffort || 'auto'}`);
      return;
    }
    const choice = await select({
      message: `Reasoning level · ${model.provider_model_id}`,
      initialValue: model.reasoning_efforts.includes(preferences.reasoningEffort) ? preferences.reasoningEffort : model.reasoning_efforts[0],
      options: model.reasoning_efforts.map((value) => ({ value, label: value === 'xhigh' ? 'Extra high' : value === 'max' ? 'Max' : value[0].toUpperCase() + value.slice(1) })),
    });
    if (isCancel(choice)) return;
    effort = choice;
  }
  if (!model.reasoning_efforts.includes(effort)) throw new Error(`unsupported reasoning level for ${model.provider_model_id}: ${effort}`);
  updateCliPreferences(cwd, { reasoningEffort: effort });
  writeLine(state.write, `  reasoning → ${effort}`);
}

function setServiceTier(cwd, tier, write) {
  const { model } = selectedModel(cwd);
  if (!model.service_tiers.includes(tier)) throw new Error(`${model.provider_model_id} does not declare ${tier} processing support`);
  updateCliPreferences(cwd, { serviceTier: tier });
  const label = tier === 'default' ? 'standard' : tier;
  writeLine(write, `  processing → ${label}`);
  if (tier === 'fast') writeLine(write, '  Fast is a paid latency choice; Agent Sam will account for its model-specific pricing multiplier.');
  if (tier === 'flex') writeLine(write, '  Flex trades latency/capacity availability for lower cost; it is not Batch.');
}

async function showCommandPicker(state) {
  if (!state.interactive) {
    state.write(renderShellCatalog());
    return;
  }
  const choice = await select({
    message: 'Agent Sam commands',
    options: SLASH_COMMANDS.map((row) => ({ value: row.cmd, label: row.cmd, hint: row.description })),
  });
  if (isCancel(choice)) return;
  await dispatchShellLine(choice, state);
}

export async function runLocalAgent(goal, write, options = {}) {
  if (!goal) {
    writeLine(write, '  Usage: /agent <goal>');
    writeLine(write, '  Requires the local Agent Sam dev server (default http://127.0.0.1:8787).');
    return;
  }
  const base = String(process.env.AGENTSAM_LOCAL_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || fetch;
  const activity = options.activity || createRuntimeActivity({ write, phase: 'thinking', interactive: options.interactive });
  let response;
  activity.start('thinking');
  try {
    response = await fetchImpl(`${base}/api/agentsam/message`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: goal }),
    });
  } catch (error) {
    activity.fail('unavailable');
    throw new Error(`local Agent Sam unavailable at ${base} — run \`npm run dev\` first (${error?.message || error})`);
  }
  let text;
  try { text = await response.text(); }
  catch (error) { activity.fail('response error'); throw new Error(`local Agent Sam response could not be read: ${error?.message || error}`); }
  if (!response.ok) { activity.fail(`HTTP ${response.status}`); throw new Error(`local Agent Sam returned HTTP ${response.status}: ${text.slice(0, 400)}`); }
  activity.succeed('done');
  try { writeLine(write, JSON.stringify(JSON.parse(text), null, 2)); }
  catch { writeLine(write, text); }
}

async function showLocalLogs(cwd, write) {
  const dbPath = path.join(cwd, '.agentsam', 'data', 'agentsam.sqlite');
  if (!fs.existsSync(dbPath)) { writeLine(write, '  No local Agent Sam DB found. Run `agentsam init . --yes` first.'); return; }
  const { createLocalSqliteDatabase } = await import('../local/sqlite.js');
  const db = await createLocalSqliteDatabase(dbPath);
  try {
    const calls = await db.prepare('SELECT id, session_id, tool_name, status, created_at, completed_at FROM agent_tool_calls ORDER BY created_at DESC LIMIT 20').all();
    if (!calls.results.length) { writeLine(write, '  No local Agent Sam tool-call events yet.'); return; }
    writeLine(write, '\n  Recent Agent Sam tool calls');
    for (const row of calls.results) writeLine(write, `  ${String(row.created_at || '').padEnd(20)} ${String(row.status || '').padEnd(10)} ${row.tool_name}`);
    writeLine(write, '');
  } finally { db.close(); }
}

function formatCount(value) {
  return Math.max(0, Number(value || 0)).toLocaleString('en-US');
}

function formatUsd(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'unavailable';
  const currency = String.fromCharCode(36);
  if (amount === 0) return currency + '0.000000';
  return currency + (amount < 0.01 ? amount.toFixed(6) : amount.toFixed(4));
}

export function renderSessionReceipt(session) {
  if (!session) return '';
  const usage = session.cumulative_usage || {};
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const cached = Number(usage.cached_input_tokens || 0);
  const cacheWrite = Number(usage.cache_write_tokens || 0);
  const reasoning = Number(usage.reasoning_tokens || 0);
  const total = input + output;
  const active = Number(session.usage_snapshot?.current_context?.input_tokens || 0);
  const model = session.provider_model_id || session.model_key || 'model unavailable';
  const breakdown = session.cost_breakdown_usd || {};
  const componentTotal = ['input', 'cached_input', 'cache_write', 'output'].reduce((sum, key) => sum + Number(breakdown[key] || 0), 0);
  const lines = [
    '',
    `Token usage: total=${formatCount(total)} input=${formatCount(input)}${cached ? ` (+ ${formatCount(cached)} cached)` : ''}${cacheWrite ? ` (+ ${formatCount(cacheWrite)} cache write)` : ''} output=${formatCount(output)}${reasoning ? ` reasoning=${formatCount(reasoning)}` : ''}`,
    `Spent: ${formatUsd(session.total_cost_usd)} · ${model}${session.actual_service_tier ? ` · ${session.actual_service_tier}` : ''}`,
  ];
  if (componentTotal > 0) {
    lines.push(`Cost breakdown: input ${formatUsd(breakdown.input)} · cached ${formatUsd(breakdown.cached_input)} · cache write ${formatUsd(breakdown.cache_write)} · output ${formatUsd(breakdown.output)}`);
  }
  if (active) lines.push(`Active context: ${formatCount(active)} tokens`);
  lines.push('', 'To continue this session, run:', `  agentsam resume ${session.id}`, '', 'Or run:', '  agentsam resume', '', 'and select:', `  ${session.title || 'this session'}`, '');
  return lines.join('\n');
}

function persistSession(state, patch = {}) {
  if (!state.session) return null;
  state.session = saveLocalSession({ ...state.session, ...patch }, { home: state.home });
  return state.session;
}

function recordSessionInput(state, input) {
  const value = String(input || '').trim();
  if (!state.session || !value) return;
  const housekeeping = new Set(['/exit', '/quit', '/session', '/help', '/', '/menu', '/clear']);
  if (housekeeping.has(value.toLowerCase())) return;
  persistSession(state, {
    status: 'active',
    last_input: value,
    title: sessionTitleFromInput(value),
  });
}

function safeToolInput(value, depth = 0) {
  if (depth > 3) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 12).map((row) => safeToolInput(row, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|api[_-]?key|authorization/i.test(key)) output[key] = '[REDACTED]';
    else output[key] = safeToolInput(item, depth + 1);
  }
  return output;
}

async function approveModelRequest(preflight, state) {
  const approvedCeiling = Number(state.session?.approved_projected_call_cost_usd || 0);
  if (approvedCeiling > 0 && preflight.projected_max_call_cost_usd <= approvedCeiling) return true;
  if (!state.interactive) return false;
  writeLine(state.write, '');
  writeLine(state.write, '  Model request');
  writeLine(state.write, `  model       ${preflight.model}`);
  writeLine(state.write, `  reasoning   ${preflight.reasoning_effort}`);
  writeLine(state.write, `  processing  ${preflight.service_tier}`);
  writeLine(state.write, `  context     ~${formatCount(preflight.estimated_input_tokens)} input tokens`);
  writeLine(state.write, `  max call    ${formatUsd(preflight.projected_max_call_cost_usd)} conservative ceiling`);
  if (Number.isFinite(preflight.tokens_until_pricing_threshold)) writeLine(state.write, `  price cliff ${formatCount(preflight.tokens_until_pricing_threshold)} tokens headroom`);
  const approved = await confirm({ message: 'Send this request?', initialValue: true });
  if (isCancel(approved) || approved !== true) return false;
  persistSession(state, { approved_projected_call_cost_usd: Math.max(approvedCeiling, preflight.projected_max_call_cost_usd) });
  return true;
}

async function approveToolExecution(request, state) {
  const sideEffects = request?.descriptor?.side_effects || 'none';
  if (sideEffects === 'none') return true;
  const key = toolApprovalKey(request.capability_id, request.input);
  if (isExecutionApproved({ cwd: state.cwd, key }, { home: state.home })) return true;
  if (!state.interactive) return false;

  const summary = JSON.stringify(safeToolInput(request.input || {}));
  writeLine(state.write, '');
  writeLine(state.write, '  Agent Sam needs execution permission');
  writeLine(state.write, `  action  ${key}`);
  writeLine(state.write, `  target  local runtime · ${compactCwd(state.cwd)}`);
  writeLine(state.write, `  effect  ${sideEffects}`);
  if (summary && summary !== '{}') writeLine(state.write, `  input   ${summary.length > 500 ? `${summary.slice(0, 497)}...` : summary}`);
  writeLine(state.write, '  secrets remain runtime-owned and are not included in the model-visible result.');

  const choice = await select({
    message: `Allow ${key}?`,
    options: [
      { value: 'once', label: 'Allow once' },
      { value: 'always', label: `Always allow ${key} in this project` },
      { value: 'deny', label: 'Deny' },
    ],
  });
  if (isCancel(choice) || choice === 'deny') return false;
  if (choice === 'always') grantExecutionApproval({ cwd: state.cwd, key, label: key }, { home: state.home });
  return true;
}

async function runInteractiveModelTurn(prompt, state) {
  const { preferences, model } = selectedModel(state.cwd);
  if (model.provider !== 'openai') throw new Error(`interactive_provider_not_implemented:${model.provider}`);
  const credential = resolveProviderCredential(model.provider, { home: state.home });
  if (!credential.configured) throw new Error(`provider_credential_unavailable:${model.provider}:${credential.error || credential.env || 'not_configured'}`);

  const activity = createRuntimeActivity({ write: state.write, phase: 'thinking', interactive: state.interactive });
  const provider = createOpenAIResponsesAdapter({ apiKey: credential.value });
  const capabilityAdapter = createCapabilityAdapter();
  const samePolicy = state.session
    && state.session.model_key === model.model_key
    && state.session.reasoning_effort === preferences.reasoningEffort
    && state.session.requested_service_tier === preferences.serviceTier;
  const previousResponseId = samePolicy ? state.session?.provider_state?.previous_response_id : null;
  const previousUsageSnapshot = samePolicy ? state.session?.usage_snapshot : null;

  activity.start('thinking');
  let result;
  try {
    result = await runResponsesAgent({
      provider,
      capabilityAdapter,
      cwd: state.cwd,
      prompt,
      model: model.model_key,
      reasoningEffort: preferences.reasoningEffort,
      serviceTier: preferences.serviceTier,
      previousResponseId,
      previousUsageSnapshot,
      cumulativeUsage: state.session?.cumulative_usage || null,
      promptCacheKey: state.session?.id || undefined,
      runId: state.session?.id || undefined,
      beforeRequest: (preflight) => approveModelRequest(preflight, state),
      beforeTool: (request) => approveToolExecution(request, state),
      emit(event) {
        if (event?.type === 'usage.snapshot') state.usageSnapshot = event.payload;
      },
    });
  } catch (error) {
    activity.fail('failed');
    throw error;
  }
  activity.succeed('done');
  if (result.output_text) {
    writeLine(state.write, '');
    writeLine(state.write, result.output_text);
    writeLine(state.write, '');
  }
  state.usageSnapshot = result.usage_snapshot;
  if (state.session) {
    persistSession(state, {
      status: 'active',
      model_key: model.model_key,
      provider_model_id: result.model,
      reasoning_effort: result.reasoning_effort,
      requested_service_tier: result.requested_service_tier,
      actual_service_tier: result.actual_service_tier,
      provider_state: { provider: model.provider, previous_response_id: result.response_id },
      usage_snapshot: result.usage_snapshot,
      cumulative_usage: result.cumulative_usage,
      total_cost_usd: Number(state.session.total_cost_usd || 0) + Number(result.total_cost_usd || 0),
      cost_breakdown_usd: Object.fromEntries(['input', 'cached_input', 'cache_write', 'output'].map((key) => [
        key, Number(state.session.cost_breakdown_usd?.[key] || 0) + Number(result.cost_breakdown_usd?.[key] || 0),
      ])),
      last_error: null,
    });
  }
  return result;
}

export async function dispatchShellLine(line, state = {}) {
  const tokens = tokenizeShellLine(line);
  const write = state.write || ((text) => process.stdout.write(text));
  state.write = write;
  state.cwd = path.resolve(state.cwd || process.cwd());
  if (!tokens.length) return { handled: true, exit: false, cwd: state.cwd };
  const [command, ...args] = tokens;
  try {
    switch (command.toLowerCase()) {
      case '/':
      case '/menu':
        await showCommandPicker(state);
        break;
      case '/help':
        write(renderShellCatalog());
        break;
      case '/exit':
      case '/quit':
        return { handled: true, exit: true, cwd: state.cwd };
      case '/model': {
        const configured = await configureCliPreferences({ cwd: state.cwd, firstRun: false, section: 'model' });
        state.cwd = configured.identity.root;
        break;
      }
      case '/reasoning':
        await chooseReasoning(state.cwd, args, state);
        break;
      case '/fast':
        setServiceTier(state.cwd, 'fast', write);
        break;
      case '/flex':
        setServiceTier(state.cwd, 'flex', write);
        break;
      case '/standard':
        setServiceTier(state.cwd, 'default', write);
        break;
      case '/context':
        if (args[0] === 'repo' || args[0] === 'git') await runContext(['--cwd', state.cwd, ...args.slice(1)]);
        else write(renderContextEconomics(buildContextEconomicsReport(state.cwd, {
          activeInputTokens: state.usageSnapshot?.current_context?.input_tokens,
          estimateKind: state.usageSnapshot?.estimate_kind,
        })));
        break;
      case '/status':
        await runStatus(args, { cwd: state.cwd });
        break;
      case '/models':
        await runModels(args, { cwd: state.cwd, write, home: state.home });
        break;
      case '/login':
        await runLogin(args, { write, home: state.home });
        break;
      case '/logout':
        runLogout(args, { write, home: state.home });
        if (state.session) write(renderSessionReceipt(state.session));
        break;
      case '/whoami':
        await runWhoami(args, { write, home: state.home });
        break;
      case '/session':
      case '/usage':
        if (state.session) write(renderSessionReceipt(state.session));
        else writeLine(write, '  No persistent session is active in this shell invocation.');
        break;
      case '/cf':
      case '/cloudflare':
        await runCloudflare(args.length ? args : ['commands'], { cwd: state.cwd, write });
        break;
      case '/settings': {
        const configured = await configureCliPreferences({ cwd: state.cwd, firstRun: false });
        state.cwd = configured.identity.root;
        break;
      }
      case '/pwd':
        writeLine(write, state.cwd);
        break;
      case '/cd': {
        const destination = args.length ? args.join(' ') : process.env.HOME || process.env.USERPROFILE || state.cwd;
        const next = path.resolve(state.cwd, destination);
        if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) throw new Error(`directory not found: ${next}`);
        state.cwd = next;
        writeLine(write, state.cwd);
        break;
      }
      case '/git':
        spawnGit(state.cwd, args.length ? args : ['status', '--short', '--branch']);
        break;
      case '/diff':
        spawnGit(state.cwd, ['diff', ...args]);
        break;
      case '/db':
        await runDb(args.length ? args : ['status'], { cwd: state.cwd });
        break;
      case '/agent':
        await runLocalAgent(args.join(' '), write, { interactive: state.interactive });
        break;
      case '/logs':
        await showLocalLogs(state.cwd, write);
        break;
      case '/deploy':
        await runDeploy(parseDeployOptions(args, state.cwd));
        break;
      case '/clear':
        write('\x1b[2J\x1b[H');
        break;
      default:
        if (!command.startsWith('/')) {
          await runInteractiveModelTurn(line, state);
          break;
        }
        writeLine(write, `  Unknown Agent Sam command: ${command}`);
        writeLine(write, '  Type / or /help for available commands.');
        return { handled: false, exit: false, cwd: state.cwd };
    }
  } catch (error) {
    if (state.session) {
      persistSession(state, { last_error: diagnosticFromError(error, { source: 'shell', kind: 'interactive_error' }) });
    }
    if (!error?.reported) {
      for (const line of renderDiagnosticError(error).split('\n')) writeLine(write, `  ${line}`);
    }
  }
  return { handled: true, exit: false, cwd: state.cwd };
}

export async function runShell(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const state = {
    cwd: path.resolve(options.cwd || process.cwd()),
    write,
    interactive: options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
    usageSnapshot: options.usageSnapshot || options.session?.usage_snapshot || null,
    session: options.session || null,
    home: options.home,
  };
  const sub = argv[0] || '';
  if (sub === 'list' || sub === 'status') { write(renderShellCatalog()); return; }
  if (sub === '--command' || sub === '--once') {
    const line = argv.slice(1).join(' ');
    if (!line) throw new Error(`${sub} requires a slash command`);
    await dispatchShellLine(line, state);
    return;
  }
  if (sub) throw new Error(`unknown shell option: ${sub}`);

  if (state.session) {
    state.cwd = path.resolve(state.session.cwd || state.cwd);
    state.session = saveLocalSession({ ...state.session, status: 'active', cwd: state.cwd }, { home: state.home });
    state.usageSnapshot = state.session.usage_snapshot || state.usageSnapshot;
  } else {
    const preferences = readCliPreferences(state.cwd) || {};
    state.session = createLocalSession({
      cwd: state.cwd,
      status: 'active',
      model_key: preferences.modelPreference !== 'auto' ? preferences.modelPreference : null,
      reasoning_effort: preferences.reasoningEffort !== 'auto' ? preferences.reasoningEffort : null,
      requested_service_tier: preferences.serviceTier || 'default',
    }, { home: state.home });
  }

  if (options.intro !== 'quiet') {
    write(renderShellCatalog());
    writeLine(write, '  Interactive shell ready. Type / for the command picker; /exit to return to your host shell.\n');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  let interrupted = false;
  rl.on('SIGINT', () => {
    interrupted = true;
    rl.close();
  });
  const promptText = () => {
    if (typeof options.prompt === 'function') return options.prompt(state);
    if (typeof options.prompt === 'string' && options.prompt) return options.prompt;
    return renderShellPrompt(state.cwd);
  };
  if (rl.terminal) { rl.setPrompt(promptText()); rl.prompt(); }
  for await (const line of rl) {
    recordSessionInput(state, line);
    const result = await dispatchShellLine(line, state);
    if (result.exit) { rl.close(); break; }
    if (rl.terminal) { rl.setPrompt(promptText()); rl.prompt(); }
  }
  if (state.session) {
    persistSession(state, { status: interrupted ? 'interrupted' : 'paused', cwd: state.cwd });
    if (options.receipt !== false) write(renderSessionReceipt(state.session));
  }
  return state.session;
}
