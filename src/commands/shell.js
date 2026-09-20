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
import { runProviders } from './providers.js';
import { configureCliPreferences } from './preferences.js';
import { runCloudflare } from './cloudflare.js';
import { runConnections } from './connections.js';
import { runTunnel } from './tunnel.js';
import { probeOllamaModel, resolveOllamaConfig } from './ollama.js';
import { createInlineActivity } from '../ui/cli/activity.js';
import { createCliRuntimePresenter } from '../ui/cli/runtime-events.js';
import { renderCliFooter, renderDiffPreview, renderUsagePanel } from '../ui/cli/footer.js';
import { diagnosticFromError, renderDiagnosticError } from '../errors/index.js';
import { getModelRecord } from '../models/index.js';
import { discoverProviderModels } from '../models/discovery.js';
import { detectCliProject, findCliProjectRoot, readCliPreferences, updateCliPreferences } from '../lib/cli-preferences.js';
import { buildContextEconomicsReport, renderContextEconomics } from './context-economics.js';
import { createProviderAdapter } from '../providers/index.js';
import { createCapabilityAdapter, runResponsesAgent } from '../agent/index.js';
import { resolveProviderCredential } from '../lib/provider-credentials.js';
import { createLocalSession, saveLocalSession, localSessionElapsedMs } from '../lib/local-sessions.js';
import { runtimeDatabasePath } from '../local/runtime-store.js';
import { grantExecutionApproval, isExecutionApproved, toolApprovalKey } from '../lib/execution-approvals.js';
import { runWhoami } from './whoami.js';
import { runLogin, runLogout } from './account-auth.js';
import { runHelp } from '../ui/cli/help.js';
import { hydrateSecureCredentials } from '../security/local-vault.js';
import { readAccountSession } from '../lib/account-session.js';
import { startRuntimeRun, finishRuntimeRun, recordRuntimeCompaction } from '../local/runtime-store.js';
import { tryResolveGitContext } from '../../packages/agentsam-repository/src/git-context.js';
import { syncWorkspaceStateToD1, readWorkspaceStateFromD1 } from '../../packages/agentsam-repository/src/workspace-state.js';
import { syncGitCommitsToD1 } from '../../packages/agentsam-repository/src/work-tracking.js';
import { readGoapState, renderGoapStatus, renderGoapGoal, renderGoapWhy, renderGoapPlan } from '../../packages/agentsam-repository/src/goap.js';

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

export const PASTE_COLLAPSE_LINE_THRESHOLD = 5;
export const PASTE_COLLAPSE_CHAR_THRESHOLD = 300;
const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';
const BRACKETED_PASTE_ENABLE = '\x1b[?2004h';
const BRACKETED_PASTE_DISABLE = '\x1b[?2004l';

export function countPasteLines(text) {
  const source = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!source) return 0;
  const parts = source.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return Math.max(parts.length, source ? 1 : 0);
}

export function shouldCollapsePaste(text) {
  const source = String(text ?? '');
  return countPasteLines(source) > PASTE_COLLAPSE_LINE_THRESHOLD || source.length > PASTE_COLLAPSE_CHAR_THRESHOLD;
}

export function renderCollapsedPaste(text) {
  return `[Pasted ${countPasteLines(text)} lines — Enter to run, Backspace to clear]`;
}

export function installPasteCollapse(rl, options = {}) {
  if (!rl || rl.terminal === false || typeof rl._ttyWrite !== 'function') return () => {};
  const original = rl._ttyWrite.bind(rl);
  let collapsed = null;
  let collecting = '';
  let inPaste = false;

  function refresh(line) {
    rl.line = line;
    rl.cursor = line.length;
    if (typeof rl._refreshLine === 'function') rl._refreshLine();
  }

  function showCollapsed(text) {
    collapsed = text;
    refresh(renderCollapsedPaste(text));
  }

  function consumePaste(body) {
    inPaste = false;
    collecting = '';
    if (shouldCollapsePaste(body)) {
      showCollapsed(body);
      return true;
    }
    original(body);
    return true;
  }

  rl._ttyWrite = (s, key) => {
    const str = s == null ? '' : String(s);

    if (str.includes(BRACKETED_PASTE_START) || key?.name === 'paste-start') {
      inPaste = true;
      collecting = str.replace(BRACKETED_PASTE_START, '');
      if (collecting.includes(BRACKETED_PASTE_END) || key?.name === 'paste-end') {
        return consumePaste(collecting.replace(BRACKETED_PASTE_END, ''));
      }
      return undefined;
    }
    if (inPaste) {
      collecting += str;
      if (collecting.includes(BRACKETED_PASTE_END) || key?.name === 'paste-end') {
        return consumePaste(collecting.replace(BRACKETED_PASTE_END, ''));
      }
      return undefined;
    }

    if (collapsed) {
      if (key?.name === 'backspace' || key?.name === 'delete') {
        collapsed = null;
        refresh('');
        return undefined;
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        const text = collapsed;
        collapsed = null;
        rl.line = text;
        rl.cursor = text.length;
        return original('\n', { name: 'return' });
      }
    }

    if (str && !key?.name && shouldCollapsePaste(str.replace(/\n$/, ''))) {
      const payload = str.endsWith('\n') ? str.slice(0, -1) : str;
      showCollapsed(payload);
      return undefined;
    }

    return original(s, key);
  };

  try { options.output?.write?.(BRACKETED_PASTE_ENABLE); } catch { /* ignore */ }
  return () => {
    rl._ttyWrite = original;
    try { options.output?.write?.(BRACKETED_PASTE_DISABLE); } catch { /* ignore */ }
  };
}

function resolveShellIdentity(state) {
  if (state.identity && state.identityCwd === state.cwd) return state.identity;
  try { state.identity = detectCliProject(state.cwd); }
  catch { state.identity = { project: path.basename(state.cwd || ''), branch: '', root: state.cwd }; }
  state.identityCwd = state.cwd;
  return state.identity;
}

function renderShellSessionFooter(state) {
  const identity = resolveShellIdentity(state);
  const preferences = readCliPreferences(state.cwd) || {};
  return renderCliFooter({
    projectName: identity.project,
    branch: identity.branch,
    cwd: compactCwd(state.cwd),
    model: state.session?.provider_model_id || state.session?.model_key || preferences.modelPreference,
    provider: state.providerState?.provider || state.session?.provider_state?.provider,
    effort: state.session?.reasoning_effort || preferences.reasoningEffort,
    tier: state.session?.actual_service_tier || state.session?.requested_service_tier || preferences.serviceTier,
    usageSnapshot: state.usageSnapshot || state.session?.usage_snapshot,
    elapsedMs: state.lastTurnElapsedMs ?? (state.session ? localSessionElapsedMs(state.session) : undefined),
    action: state.activity?.active ? 'working' : '',
  });
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
  return [
    '',
    '  Agent Sam',
    '  Type normally to work with the selected model.',
    '',
    '    /        command picker',
    '    /model   model · reasoning · processing',
    '    /usage   tokens · cost · resume receipt',
    '    /help    focused help',
    '    /exit    return to host shell',
    '',
    `  ${next?.label ?? 'interactive runtime'} · ${SLASH_COMMANDS.length} commands available through /`,
    '',
  ].join('\n');
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
  const snapshot = preferences.modelSnapshot?.model_key === preferences.modelPreference
    ? preferences.modelSnapshot
    : null;
  let model = snapshot || getModelRecord(preferences.modelPreference);
  if (!model && (preferences.modelPreference === 'auto' || !preferences.modelPreference)) {
    model = preferences.modelSnapshot || listModelCatalog()[0];
  }
  if (!model) throw new Error('Select an exact provider-verified model with /model first so Agent Sam can verify supported runtime controls.');
  return { preferences, model };
}

async function resolveModelForTurn(cwd, state) {
  const selected = selectedModel(cwd);
  const { preferences } = selected;
  let model = selected.model;

  if (model.provider === 'ollama') {
    const config = resolveOllamaConfig({}, process.env);
    const probe = await probeOllamaModel(model.provider_model_id, config, state.providerFetchImpl || fetch);
    if (!probe.ok) throw new Error(`ollama_model_probe_failed:${model.provider_model_id}:${probe.error || 'unknown'}`);
    model = {
      ...model,
      context_window: probe.context_window,
      context_window_source: probe.context_window_source || 'unknown',
      capabilities: { ...(model.capabilities || {}), local_runtime: true, ...(Object.fromEntries((probe.capabilities || []).map((name) => [name, true]))) },
    };
    updateCliPreferences(cwd, { modelPreference: model.model_key, modelSnapshot: model });
    return { preferences: readCliPreferences(cwd) || preferences, model, credential: null, verification: 'local_runtime' };
  }

  const credential = resolveProviderCredential(model.provider, { home: state.home });
  if (!credential.configured) {
    throw new Error(`provider_credential_unavailable:${model.provider}:${credential.error || credential.env || 'not_configured'}`);
  }

  const discovery = await discoverProviderModels(model.provider, credential, { fetchImpl: state.providerFetchImpl || fetch });
  if (discovery.ok) {
    const live = discovery.models.find((row) => row.provider_model_id === model.provider_model_id || row.model_key === model.model_key);
    if (!live) throw new Error(`selected_model_not_available_for_credential:${model.provider}:${model.provider_model_id}`);
    model = live;
    updateCliPreferences(cwd, { modelPreference: live.model_key, modelSnapshot: live });
    return { preferences: readCliPreferences(cwd) || preferences, model, credential, verification: 'provider_api' };
  }

  if (preferences.modelSnapshot?.availability === 'available') {
    return { preferences, model, credential, verification: 'cached_provider_snapshot', discoveryError: discovery.error || null };
  }
  throw new Error(`provider_model_discovery_failed:${model.provider}:${discovery.error || 'unknown'}`);
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
  const activity = options.activity || createInlineActivity({ write, label: 'Thinking', interactive: options.interactive });
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
  const dbPath = runtimeDatabasePath(cwd);
  if (!fs.existsSync(dbPath)) { writeLine(write, '  No local Agent Sam runs yet.'); return; }
  const { createLocalSqliteDatabase } = await import('../local/sqlite.js');
  const db = await createLocalSqliteDatabase(dbPath);
  try {
    const runs = await db.prepare('SELECT id, model_key, status, started_at_unix FROM agentsam_agent_run ORDER BY started_at_unix DESC LIMIT 20').all();
    if (!runs.results.length) { writeLine(write, '  No local Agent Sam runs yet.'); return; }
    writeLine(write, '\n  Recent Agent Sam runs');
    for (const row of runs.results) writeLine(write, `  ${new Date(Number(row.started_at_unix) * 1000).toISOString()} ${String(row.status || '').padEnd(10)} ${row.model_key || 'model unknown'} · ${row.id}`);
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

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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
  const elapsed = localSessionElapsedMs(session);
  const lines = [
    '',
    'Session summary',
    `Token usage: total=${formatCount(total)} input=${formatCount(input)}${cached ? ` (+ ${formatCount(cached)} cached)` : ''}${cacheWrite ? ` (+ ${formatCount(cacheWrite)} cache write)` : ''} output=${formatCount(output)}${reasoning ? ` reasoning=${formatCount(reasoning)}` : ''}`,
    `Spent: ${formatUsd(session.total_cost_usd)} · ${model}${session.actual_service_tier ? ` · ${session.actual_service_tier}` : ''}`,
    `Elapsed: ${formatElapsed(elapsed)}`,
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
  state.session = saveLocalSession({ ...state.session, ...patch }, { home: state.home, projectRoot: state.projectRoot });
  return state.session;
}

function recordSessionInput(state, input) {
  const value = String(input || '').trim();
  if (!state.session || !value) return;
  const housekeeping = new Set(['/exit', '/quit', '/session', '/help', '/', '/menu', '/clear']);
  if (housekeeping.has(value.toLowerCase())) return;
  persistSession(state, {
    status: 'active',
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
  const projected = Number(preflight.projected_max_call_cost_usd);
  const threshold = Number(process.env.AGENTSAM_CONFIRM_CALL_COST_USD || 0);
  if (!(Number.isFinite(projected) && projected >= 0)) return true;
  if (!(Number.isFinite(threshold) && threshold > 0) || projected <= threshold) return true;

  const approvedCeiling = Number(state.session?.approved_projected_call_cost_usd || 0);
  if (approvedCeiling > 0 && projected <= approvedCeiling) return true;
  if (!state.interactive) return false;

  state.activity?.clear?.();
  writeLine(state.write, '');
  writeLine(state.write, '  ◆ Model cost approval');
  writeLine(state.write, `    model       ${preflight.model}`);
  writeLine(state.write, `    reasoning   ${preflight.reasoning_effort}`);
  writeLine(state.write, `    processing  ${preflight.service_tier}`);
  writeLine(state.write, `    context     ~${formatCount(preflight.estimated_input_tokens)} input tokens`);
  writeLine(state.write, `    max call    ${formatUsd(projected)} conservative ceiling`);
  if (Number.isFinite(preflight.tokens_until_pricing_threshold)) writeLine(state.write, `    headroom    ${formatCount(preflight.tokens_until_pricing_threshold)} tokens`);
  const approved = await confirm({ message: 'Allow this call?', initialValue: false });
  if (isCancel(approved) || approved !== true) return false;
  persistSession(state, { approved_projected_call_cost_usd: Math.max(approvedCeiling, projected) });
  state.activity?.start?.('Working');
  return true;
}

async function approveToolExecution(request, state) {
  const sideEffects = request?.descriptor?.side_effects || 'none';
  if (sideEffects === 'none') return true;
  const key = toolApprovalKey(request.capability_id, request.input);
  if (isExecutionApproved({ cwd: state.cwd, key }, { home: state.home })) return true;
  if (!state.interactive) return false;

  const summary = JSON.stringify(safeToolInput(request.input || {}));
  state.activity?.clear?.();
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
  state.activity?.start?.(`Working · ${request.capability_id}`);
  return true;
}

async function runInteractiveModelTurn(prompt, state) {
  const resolved = await resolveModelForTurn(state.cwd, state);
  const { preferences, model, credential } = resolved;
  const provider = createProviderAdapter({
    modelRecord: model,
    credential,
    endpoint: model.provider === 'ollama' ? process.env.OLLAMA_BASE_URL : undefined,
    fetchImpl: state.providerFetchImpl,
  });
  const capabilityAdapter = createCapabilityAdapter();

  const samePolicy = state.session
    && state.session.model_key === model.model_key
    && state.session.reasoning_effort === preferences.reasoningEffort
    && state.session.requested_service_tier === preferences.serviceTier;
  const previousProviderState = samePolicy ? (state.providerState || state.session?.provider_state) : null;
  const previousUsageSnapshot = samePolicy ? state.session?.usage_snapshot : null;
  const accountId = readAccountSession({ home: state.home })?.account_id || null;
  let runtimeRunId = null;
  try {
    runtimeRunId = await startRuntimeRun({
      projectRoot: state.projectRoot,
      account_id: accountId,
      mode: 'agent',
      model_key: model.model_key,
      reasoning_effort: preferences.reasoningEffort,
      service_tier: preferences.serviceTier,
    });
  } catch {
    runtimeRunId = null;
  }

  const activity = createInlineActivity({
    write: state.write,
    interactive: state.interactive,
    label: `Thinking · ${model.provider_model_id}`,
  });
  state.activity = activity;
  const presenter = createCliRuntimePresenter({ activity, write: state.write, state });
  const startedAt = Date.now();
  activity.start(`Thinking · ${model.provider_model_id}`);

  let result;
  try {
    result = await runResponsesAgent({
      provider,
      capabilityAdapter,
      cwd: state.cwd,
      prompt,
      model: model.model_key,
      modelRecord: model,
      reasoningEffort: preferences.reasoningEffort,
      serviceTier: preferences.serviceTier,
      previousProviderState,
      previousUsageSnapshot,
      cumulativeUsage: state.session?.cumulative_usage || null,
      promptCacheKey: state.session?.id || undefined,
      runId: runtimeRunId || state.session?.id || undefined,
      beforeRequest: (preflight) => approveModelRequest(preflight, state),
      beforeTool: (request) => approveToolExecution(request, state),
      emit(event) {
        presenter.handle(event);
        if (event?.type === 'usage.snapshot') state.usageSnapshot = event.payload;
      },
    });
  } catch (error) {
    activity.fail('Failed');
    state.activity = null;
    if (runtimeRunId) {
      try {
        await finishRuntimeRun({
          projectRoot: state.projectRoot,
          id: runtimeRunId,
          status: 'failed',
          error_code: error?.code || 'interactive_error',
          error_message: error?.message || String(error),
          latency_ms: Date.now() - startedAt,
        });
      } catch { /* execution result remains primary */ }
    }
    throw error;
  }

  activity.succeed(result.tool_receipts?.length ? `Done · ${result.tool_receipts.length} tool call${result.tool_receipts.length === 1 ? '' : 's'}` : 'Done');
  state.activity = null;

  const compacted = presenter.compactionReceipt();
  if (compacted) writeLine(state.write, compacted);

  if (result.output_text) {
    writeLine(state.write, '');
    writeLine(state.write, result.output_text);
    writeLine(state.write, '');
  }

  state.usageSnapshot = result.usage_snapshot;
  state.providerState = result.provider_state || null;
  state.lastTurnElapsedMs = Date.now() - startedAt;
  if (runtimeRunId) {
    try {
      await finishRuntimeRun({
        projectRoot: state.projectRoot,
        id: runtimeRunId,
        status: 'completed',
        actual_service_tier: result.actual_service_tier,
        usage: result.cumulative_usage || result.usage_snapshot?.cumulative || {},
        cost_usd: result.total_cost_usd || 0,
        latency_ms: Date.now() - startedAt,
      });
      if (presenter.state.lastCompaction) {
        await recordRuntimeCompaction({
          projectRoot: state.projectRoot,
          account_id: accountId,
          agent_run_id: runtimeRunId,
          session_id: state.session?.id,
          provider: model.provider,
          model_key: model.model_key,
          tokens_before: presenter.state.lastCompaction.tokens_before,
          tokens_after: presenter.state.lastCompaction.tokens_after,
          summary_text: presenter.state.lastCompaction.summary_text || '',
          source_kind: model.provider === 'ollama' ? 'filesystem' : 'api',
          metadata: { verification: resolved.verification, compaction_id: presenter.state.lastCompaction.compaction_id || null },
        });
      }
    } catch { /* local telemetry persistence is best-effort */ }
  }
  if (state.session) {
    persistSession(state, {
      status: 'active',
      model_key: model.model_key,
      provider_model_id: result.model,
      reasoning_effort: result.reasoning_effort,
      requested_service_tier: result.requested_service_tier,
      actual_service_tier: result.actual_service_tier,
      provider_state: { provider: model.provider, ...(result.provider_state || {}) },
      usage_snapshot: result.usage_snapshot,
      cumulative_usage: result.cumulative_usage,
      total_cost_usd: Number(state.session.total_cost_usd || 0) + Number(result.total_cost_usd || 0),
      cost_breakdown_usd: Object.fromEntries(['input', 'cached_input', 'cache_write', 'output'].map((key) => [
        key, Number(state.session.cost_breakdown_usd?.[key] || 0) + Number(result.cost_breakdown_usd?.[key] || 0),
      ])),
      last_error: null,
    });
  }

  const identity = resolveShellIdentity(state);
  writeLine(state.write, renderCliFooter({
    projectName: identity.project,
    branch: identity.branch,
    cwd: compactCwd(state.cwd),
    model: result.model || model.provider_model_id,
    provider: model.provider,
    effort: result.reasoning_effort,
    usageSnapshot: result.usage_snapshot,
    tier: result.actual_service_tier,
    elapsedMs: state.lastTurnElapsedMs,
  }));
  writeLine(state.write, '');
  state.wroteTurnFooter = true;
  return result;
}

export async function dispatchShellLine(line, state = {}) {
  let tokens = tokenizeShellLine(line);
  const write = state.write || ((text) => process.stdout.write(text));
  state.write = write;
  state.cwd = path.resolve(state.cwd || process.cwd());
  state.projectRoot ||= findCliProjectRoot(state.cwd);
  if (!tokens.length) return { handled: true, exit: false, cwd: state.cwd };

  // Handle prefix "agentsam <cmd>" or bare common commands without "/"
  if (tokens[0].toLowerCase() === 'agentsam') {
    tokens = tokens.slice(1);
    if (!tokens.length) tokens = ['help'];
    tokens[0] = `/${tokens[0].replace(/^\/+/, '')}`;
  } else if (!tokens[0].startsWith('/')) {
    const bare = tokens[0].toLowerCase();
    const commonVerbs = [
      'help', 'exit', 'quit', 'clear', 'status', 'models', 'model',
      'whoami', 'cf', 'cloudflare', 'db', 'tunnel', 'connections',
      'connect', 'usage', 'session', 'providers', 'settings', 'logs',
      'git', 'diff', 'pwd', 'cd', 'fast', 'flex', 'standard', 'reasoning',
    ];
    if (commonVerbs.includes(bare)) {
      tokens[0] = `/${bare}`;
    }
  }

  const [command, ...args] = tokens;
  try {
    switch (command.toLowerCase()) {
      case '/':
      case '/menu':
        await showCommandPicker(state);
        break;
      case '/help':
        await runHelp(args, { write, interactive: state.interactive });
        break;
      case '/exit':
      case '/quit':
        return { handled: true, exit: true, cwd: state.cwd };
      case '/model': {
        state.rl?.pause?.();
        try {
          const configured = await configureCliPreferences({ cwd: state.cwd, firstRun: false, section: 'model', home: state.home });
          state.cwd = configured.identity.root;
          state.projectRoot = findCliProjectRoot(state.cwd);
        } finally {
          if (process.stdin.isPaused()) process.stdin.resume();
          state.rl?.resume?.();
        }
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
        state.rl?.pause?.();
        try {
          await runModels(args, { cwd: state.cwd, write, home: state.home, interactive: state.interactive });
        } finally {
          if (process.stdin.isPaused()) process.stdin.resume();
          state.rl?.resume?.();
        }
        break;
      case '/providers':
        state.rl?.pause?.();
        try {
          await runProviders(args, { write, home: state.home, interactive: state.interactive });
        } finally {
          if (process.stdin.isPaused()) process.stdin.resume();
          state.rl?.resume?.();
        }
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
        if (state.session) write(renderSessionReceipt(state.session));
        else writeLine(write, '  No persistent session is active in this shell invocation.');
        break;
      case '/usage':
        write(renderUsagePanel({
          session: state.session,
          usage: state.usageSnapshot || state.session?.usage_snapshot,
          provider: state.providerState?.provider || state.session?.provider,
          model: state.providerState?.model || state.session?.model,
          effort: state.providerState?.reasoning_effort || state.session?.reasoning_effort,
          tier: state.providerState?.service_tier || state.session?.service_tier,
          estimateKind: state.usageSnapshot?.estimate_kind,
          elapsedMs: state.session ? localSessionElapsedMs(state.session) : null,
          cost: state.usageSnapshot?.cumulative?.cost_usd ?? state.session?.cumulative_usage?.cost_usd,
        }));
        break;
      case '/cf':
      case '/cloudflare':
        await runCloudflare(args.length ? args : ['commands'], { cwd: state.cwd, write });
        break;
      case '/connections':
      case '/connect':
        await runConnections(args, { cwd: state.cwd, write, home: state.home });
        break;
      case '/tunnel':
        await runTunnel(args, { cwd: state.cwd, write, home: state.home, interactive: state.interactive });
        break;
      case '/settings': {
        state.rl?.pause?.();
        try {
          const configured = await configureCliPreferences({ cwd: state.cwd, firstRun: false, home: state.home });
          state.cwd = configured.identity.root;
          state.projectRoot = findCliProjectRoot(state.cwd);
        } finally {
          if (process.stdin.isPaused()) process.stdin.resume();
          state.rl?.resume?.();
        }
        break;
      }
      case '/pwd':
        writeLine(write, state.cwd);
        break;
      case '/cd': {
        const destination = args.length ? args.join(' ') : process.env.HOME || process.env.USERPROFILE || state.cwd;
        const next = path.resolve(state.cwd, destination);
        if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) throw new Error(`directory not found: ${next}`);
        const nextRoot = findCliProjectRoot(next);
        if (nextRoot !== (state.projectRoot || findCliProjectRoot(state.cwd))) {
          if (state.session) {
            persistSession(state, { status: 'paused', active_elapsed_ms: localSessionElapsedMs(state.session), active_started_at: null });
            state.session = createLocalSession({ cwd: next, project_root: nextRoot }, { projectRoot: nextRoot, home: state.home });
          }
          state.projectRoot = nextRoot;
          state.usageSnapshot = null;
          state.providerState = null;
        }
        state.cwd = next;
        state.identity = null;
        state.identityCwd = null;
        writeLine(write, state.cwd);
        break;
      }
      case '/git':
        spawnGit(state.cwd, args.length ? args : ['status', '--short', '--branch']);
        break;
      case '/diff': {
        const result = spawnSync('git', ['diff', '--no-color', ...args], { cwd: state.cwd, encoding: 'utf8', shell: false });
        if (result.error) throw result.error;
        if (result.status !== 0 && !String(result.stdout || '').trim()) {
          throw new Error(String(result.stderr || `git exited ${result.status}`).trim());
        }
        write(renderDiffPreview(result.stdout || ''));
        break;
      }
      case '/db':
        await runDb(args.length ? args : ['status'], { cwd: state.cwd });
        break;
      case '/agent':
        await runLocalAgent(args.join(' '), write, { interactive: state.interactive });
        break;
      case '/goap': {
        const sub = (args[0] || 'status').toLowerCase();
        const goapState = await readGoapState({ cwd: state.cwd });
        if (!goapState.ok) {
          writeLine(write, `  Failed to read GOAP state: ${goapState.error || 'unknown error'}`);
          break;
        }
        if (sub === 'goal') writeLine(write, renderGoapGoal(goapState));
        else if (sub === 'why') writeLine(write, renderGoapWhy(goapState));
        else if (sub === 'plan') writeLine(write, renderGoapPlan(goapState));
        else writeLine(write, renderGoapStatus(goapState));
        break;
      }
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
      for (const errorLine of renderDiagnosticError(error).split('\n')) writeLine(write, `  ${errorLine}`);
    }
  }
  const skipFooter = state.wroteTurnFooter;
  state.wroteTurnFooter = false;
  if (state.persistFooter && !skipFooter) {
    writeLine(write, renderShellSessionFooter(state));
    writeLine(write, '');
  }
  return { handled: true, exit: false, cwd: state.cwd };
}

export async function runShell(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const state = {
    cwd: path.resolve(options.cwd || process.cwd()),
    projectRoot: findCliProjectRoot(options.session?.project_root || options.cwd || process.cwd()),
    write,
    interactive: options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
    usageSnapshot: options.usageSnapshot || options.session?.usage_snapshot || null,
    providerState: null,
    session: options.session || null,
    home: options.home,
    providerFetchImpl: options.providerFetchImpl,
    persistFooter: options.persistFooter === true,
  };
  const sub = argv[0] || '';
  hydrateSecureCredentials(process.env, { home: state.home });
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
    state.session = saveLocalSession({
      ...state.session,
      status: 'active',
      cwd: state.cwd,
      active_started_at: new Date().toISOString(),
    }, { home: state.home, projectRoot: state.projectRoot });
    state.usageSnapshot = state.session.usage_snapshot || state.usageSnapshot;
  } else {
    const preferences = readCliPreferences(state.cwd) || {};
    state.session = createLocalSession({
      cwd: state.cwd,
      project_root: state.projectRoot,
      status: 'active',
      model_key: preferences.modelPreference !== 'auto' ? preferences.modelPreference : null,
      reasoning_effort: preferences.reasoningEffort !== 'auto' ? preferences.reasoningEffort : null,
      requested_service_tier: preferences.serviceTier || 'default',
    }, { home: state.home, projectRoot: state.projectRoot });
  }

  if (options.intro !== 'quiet') {
    write(renderShellCatalog());
    writeLine(write, '  Interactive shell ready. Type / for the command picker; /exit to return to your host shell.\n');
  }
  state.persistFooter = options.persistFooter !== false;
  writeLine(write, renderShellSessionFooter(state));
  writeLine(write, '');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  state.rl = rl;
  const restorePaste = installPasteCollapse(rl, { output: process.stdout });
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
  try {
    if (rl.terminal) { rl.setPrompt(promptText()); rl.prompt(); }
    for await (const line of rl) {
      recordSessionInput(state, line);
      const result = await dispatchShellLine(line, state);
      if (result.exit) { rl.close(); break; }
      if (process.stdin.isPaused()) {
        process.stdin.resume();
      }
      if (rl.terminal) { rl.setPrompt(promptText()); rl.prompt(); }
    }
  } finally {
    restorePaste();
    state.rl = null;
  }
  if (state.session) {
    const activeElapsedMs = localSessionElapsedMs(state.session);
    persistSession(state, {
      status: interrupted ? 'interrupted' : 'paused',
      cwd: state.cwd,
      active_elapsed_ms: activeElapsedMs,
      active_started_at: null,
    });
    if (options.receipt !== false) write(renderSessionReceipt(state.session));
  }
  return state.session;
}
