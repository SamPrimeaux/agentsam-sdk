import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cancel, confirm, intro, isCancel, outro, select, text } from '@clack/prompts';
import { collectModelsStatus } from './models.js';
import { getModelRecord, mergeModelReference } from '../models/index.js';
import { detectCliProject, readCliPreferences, writeCliPreferences } from '../lib/cli-preferences.js';
import { readAccountSession } from '../lib/account-session.js';

function stopIfCancelled(value) {
  if (!isCancel(value)) return value;
  cancel('Agent Sam setup cancelled.');
  const error = new Error('setup_cancelled');
  error.code = 'AGENTSAM_SETUP_CANCELLED';
  throw error;
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? ['where', [command]] : ['sh', ['-lc', `command -v ${command}`]];
  return spawnSync(probe[0], probe[1], { stdio: 'ignore' }).status === 0;
}

export function runtimeOptions({ accountConnected = false } = {}) {
  const rows = [{ value: 'local', label: 'Local machine', hint: 'standalone · real shell + filesystem' }];
  if (accountConnected) {
    rows.push(
      { value: 'remote', label: 'Remote', hint: 'IAM-connected enrolled runtime' },
      { value: 'sandbox', label: 'Sandbox', hint: 'IAM-connected isolated runtime' },
    );
  }
  return rows;
}

export function availableShells(env = process.env) {
  const values = [];
  const detected = path.basename(env.SHELL || env.ComSpec || '').trim();
  if (detected) values.push(detected);
  for (const shell of ['zsh', 'bash', 'fish', 'pwsh']) if (!values.includes(shell) && commandExists(shell)) values.push(shell);
  return values.length ? values : ['shell'];
}


const NON_CHAT_MODEL = /(tts|embed|transcrib|banana|imagen|veo|lyria|robotics|whisper|audio|realtime|moderation|dall-e|image|computer[- ]use|deep[- ]research|antigravity|latest)/i;
const PER_PROVIDER_LIMIT = 3;

function modelVersion(label) {
  const m = String(label).match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : [];
}
function compareVersionArrays(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
}
const createdAt = (model) => Date.parse(model.metadata?.created_at || '') || 0;

/**
 * Newest chat-capable model per family (e.g. "Claude Opus"), newest first.
 * Hides embedding/voice/image/preview-only rows and superseded versions.
 */
export function curateModels(models = [], { perProvider = 0 } = {}) {
  const best = new Map();
  for (const model of models) {
    if (NON_CHAT_MODEL.test(`${model.label} ${model.provider_model_id}`)) continue;
    const family = `${model.provider}|${String(model.label).replace(/\d+(?:\.\d+)*/g, '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
    const cur = best.get(family);
    const newer = !cur || compareVersionArrays(modelVersion(model.label), modelVersion(cur.label)) > 0
      || (compareVersionArrays(modelVersion(model.label), modelVersion(cur.label)) === 0 && createdAt(model) > createdAt(cur));
    if (newer) best.set(family, model);
  }
  const sorted = [...best.values()].sort((a, b) => createdAt(b) - createdAt(a));
  if (!perProvider) return sorted;
  const counts = {};
  return sorted.filter((x) => (counts[x.provider] = (counts[x.provider] || 0) + 1) <= perProvider);
}

export function modelOptions(status, { all = false } = {}) {
  const options = [{ value: 'auto', label: 'Automatic', hint: 'runtime chooses from this credential\'s verified inventory', model: null }];
  const pool = (status.availableModels || []).filter((m) => !(m.provider === 'openai' && m.capabilities?.agent_runtime !== true));
  const shown = all ? pool : curateModels(pool, { perProvider: PER_PROVIDER_LIMIT });
  for (const model of shown) {
    const context = Number(model.context_window) > 0 ? ` · ctx ${Math.round(Number(model.context_window) / 1000)}k` : ' · ctx unknown';
    options.push({
      value: model.model_key,
      label: `${model.provider} · ${model.label}`,
      hint: `${model.provider_model_id}${context} · provider verified`,
      model,
    });
  }
  if (status.local?.online) {
    for (const row of status.local.models || []) if (row?.name && !NON_CHAT_MODEL.test(row.name)) options.push({
      value: `ollama:${row.name}`,
      label: `Ollama · ${row.name}`,
      hint: 'local',
      model: {
        model_key: `ollama:${row.name}`, provider: 'ollama', provider_model_id: row.name, label: row.name,
        availability: 'available', availability_source: 'local_runtime', context_window: null, context_window_source: 'unknown',
        max_output_tokens: null, max_output_tokens_source: 'unknown', reasoning_efforts: ['auto'], service_tiers: ['default'], capabilities: { chat: true },
      },
    });
  }
  if (!all && curateModels(pool).length > shown.length) {
    options.push({ value: '__show_all__', label: 'Show all models…', hint: 'older versions and specialty models', model: null });
  }
  options.push({
    value: '__configure_provider__',
    label: '+ Configure an AI Provider',
    hint: 'Add OpenAI, Anthropic, Gemini, Cursor, or Grok API key',
    model: null,
  });
  return options;
}

function resolvedModel(modelPreference, modelSnapshot) {
  if (modelSnapshot?.model_key === modelPreference) return mergeModelReference(modelSnapshot);
  return getModelRecord(modelPreference);
}

function reasoningOptions(modelPreference, modelSnapshot) {
  const record = resolvedModel(modelPreference, modelSnapshot);
  if (!record) return [{ value: 'auto', label: 'Automatic', hint: 'runtime/provider default' }];
  const providerDefault = record.default_reasoning_effort || 'provider default';
  return [
    { value: 'auto', label: 'Automatic', hint: 'omit reasoning.effort · provider default ' + providerDefault },
    ...record.reasoning_efforts.map((value) => ({
      value,
      label: value === 'xhigh' ? 'Extra high' : value === 'max' ? 'Max' : value[0].toUpperCase() + value.slice(1),
      hint: value === record.default_reasoning_effort
        ? 'provider default'
        : value === 'low' ? 'lighter reasoning'
        : value === 'max' ? 'highest supported reasoning depth'
        : undefined,
    })),
  ];
}

function serviceTierOptions(modelPreference, modelSnapshot) {
  const record = resolvedModel(modelPreference, modelSnapshot);
  if (!record) return [{ value: 'default', label: 'Standard', hint: 'default provider processing' }];
  return record.service_tiers.map((value) => {
    if (value === 'fast') return { value, label: 'Fast', hint: 'lower latency · 2× applicable token rates for Astra' };
    if (value === 'flex') return { value, label: 'Flex', hint: 'slower / capacity-sensitive · 50% of Standard for Astra' };
    return { value, label: 'Standard', hint: 'standard pricing and latency' };
  });
}

async function promptModelPreferences(identity, existing, options = {}) {
  let status = { providers: [], availableModels: [], local: { online: false, models: [] } };
  try { status = await collectModelsStatus(options.modelStatusOptions || {}); } catch { /* inventory remains best-effort */ }
  let models = modelOptions(status);
  const initialModel = models.some((row) => row.value === existing.modelPreference) ? existing.modelPreference : 'auto';
  let modelPreference = stopIfCancelled(await select({ message: 'Model', initialValue: initialModel, maxItems: 10, options: models.map(({ model, ...row }) => row) }));
  if (modelPreference === '__show_all__') {
    models = modelOptions(status, { all: true });
    modelPreference = stopIfCancelled(await select({ message: 'Model (all)', initialValue: 'auto', maxItems: 10, options: models.map(({ model, ...row }) => row) }));
  }
  if (modelPreference === '__configure_provider__') {
    const { runProviders } = await import('./providers.js');
    await runProviders([], { interactive: true, ...(options.modelStatusOptions || {}) });
    return promptModelPreferences(identity, existing, options);
  }
  const selected = models.find((row) => row.value === modelPreference)?.model || null;
  const modelSnapshot = selected || (existing.modelSnapshot?.model_key === modelPreference ? mergeModelReference(existing.modelSnapshot) : null);

  const reasoning = reasoningOptions(modelPreference, modelSnapshot);
  const initialReasoning = reasoning.some((row) => row.value === existing.reasoningEffort) ? existing.reasoningEffort : reasoning[0].value;
  const reasoningEffort = stopIfCancelled(await select({ message: 'Reasoning level', initialValue: initialReasoning, options: reasoning }));

  const tiers = serviceTierOptions(modelPreference, modelSnapshot);
  const initialTier = tiers.some((row) => row.value === existing.serviceTier) ? existing.serviceTier : tiers[0].value;
  const serviceTier = stopIfCancelled(await select({ message: 'Processing', initialValue: initialTier, options: tiers }));

  return { modelPreference, modelSnapshot, reasoningEffort, serviceTier };
}

export async function configureCliPreferences({ cwd = process.cwd(), firstRun = false, section = 'all', modelStatusOptions, home, env = process.env } = {}) {
  let identity = detectCliProject(cwd);
  const existing = readCliPreferences(identity.root) || {};
  intro(firstRun ? `You are in ${identity.root}` : section === 'model' ? 'Agent Sam model' : 'Agent Sam settings');

  let trustedDirectory = existing.trustedDirectory === true;
  if (firstRun && !trustedDirectory) {
    trustedDirectory = stopIfCancelled(await confirm({
      message: 'Do you trust the contents of this directory? Project-local instructions, hooks, and execution policy may load.',
      initialValue: false,
    }));
    if (!trustedDirectory) {
      cancel('Directory not trusted. Agent Sam did not load project-local configuration.');
      const error = new Error('directory_not_trusted');
      error.code = 'AGENTSAM_SETUP_CANCELLED';
      throw error;
    }
  }

  const accountConnected = Boolean(readAccountSession({ home, env })?.account_id);
  const runtimes = runtimeOptions({ accountConnected });
  let runtime = runtimes.some((row) => row.value === existing.runtime) ? existing.runtime : 'local';
  let terminal = existing.terminal || availableShells(env)[0];
  if (!firstRun && section === 'all') {
    const projectChoice = stopIfCancelled(await select({
      message: 'Where should Agent Sam work?',
      initialValue: 'current',
      options: [
        { value: 'current', label: `This project · ${identity.project}`, hint: identity.root },
        { value: 'other', label: 'Choose another folder' },
      ],
    }));
    if (projectChoice === 'other') {
      const folder = stopIfCancelled(await text({
        message: 'Project folder', placeholder: identity.root, defaultValue: identity.root,
        validate(value) {
          const resolved = path.resolve(String(value || ''));
          if (!fs.existsSync(resolved)) return 'Folder does not exist';
          if (!fs.statSync(resolved).isDirectory()) return 'Path is not a directory';
        },
      }));
      identity = detectCliProject(path.resolve(String(folder)));
    }
    runtime = stopIfCancelled(await select({
      message: 'Runtime', initialValue: runtime,
      options: runtimes,
    }));
    const shells = availableShells(env);
    terminal = stopIfCancelled(await select({
      message: 'Terminal', initialValue: terminal && shells.includes(terminal) ? terminal : shells[0],
      options: shells.map((shell) => ({ value: shell, label: shell, hint: shell === shells[0] ? 'detected/default' : undefined })),
    }));
  }

  const model = await promptModelPreferences(identity, existing, { modelStatusOptions: { home, env, ...(modelStatusOptions || {}) } });
  const preferences = writeCliPreferences(identity.root, { trustedDirectory, runtime, terminal, ...model });
  outro(`Ready · ${identity.project}`);
  return { identity, preferences };
}
