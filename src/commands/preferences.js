import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cancel, confirm, intro, isCancel, outro, select, text } from '@clack/prompts';
import { collectModelsStatus } from './models.js';
import { getModelRecord } from '../models/index.js';
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

export function modelOptions(status) {
  const options = [{ value: 'auto', label: 'Automatic', hint: 'runtime chooses from this credential\'s verified inventory', model: null }];
  for (const model of status.availableModels || []) {
    const context = Number(model.context_window) > 0 ? ` · ctx ${Math.round(Number(model.context_window) / 1000)}k` : ' · ctx unknown';
    options.push({
      value: model.model_key,
      label: `${model.provider} · ${model.label}`,
      hint: `${model.provider_model_id}${context} · provider verified`,
      model,
    });
  }
  if (status.local?.online) {
    for (const row of status.local.models || []) if (row?.name) options.push({
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
  return options;
}

function resolvedModel(modelPreference, modelSnapshot) {
  if (modelSnapshot?.model_key === modelPreference) return modelSnapshot;
  return getModelRecord(modelPreference);
}

function reasoningOptions(modelPreference, modelSnapshot) {
  const record = resolvedModel(modelPreference, modelSnapshot);
  if (!record) return [{ value: 'auto', label: 'Automatic', hint: 'runtime/provider default' }];
  return record.reasoning_efforts.map((value) => ({
    value,
    label: value === 'xhigh' ? 'Extra high' : value === 'max' ? 'Max' : value[0].toUpperCase() + value.slice(1),
    hint: value === 'low' ? 'lighter reasoning' : value === 'max' ? 'highest supported reasoning depth' : undefined,
  }));
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
  const models = modelOptions(status);
  const initialModel = models.some((row) => row.value === existing.modelPreference) ? existing.modelPreference : 'auto';
  const modelPreference = stopIfCancelled(await select({ message: 'Model', initialValue: initialModel, options: models.map(({ model, ...row }) => row) }));
  const selected = models.find((row) => row.value === modelPreference)?.model || null;
  const modelSnapshot = selected || (existing.modelSnapshot?.model_key === modelPreference ? existing.modelSnapshot : null);

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

  let runtime = existing.runtime || 'local';
  let terminal = existing.terminal || availableShells()[0];
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
      options: [
        { value: 'local', label: 'Local machine', hint: 'real shell + filesystem' },
        { value: 'remote', label: 'Remote', hint: 'connected remote runtime' },
        { value: 'sandbox', label: 'Sandbox', hint: 'isolated disposable runtime' },
      ],
    }));
    const shells = availableShells();
    terminal = stopIfCancelled(await select({
      message: 'Terminal', initialValue: terminal && shells.includes(terminal) ? terminal : shells[0],
      options: shells.map((shell) => ({ value: shell, label: shell, hint: shell === shells[0] ? 'detected/default' : undefined })),
    }));
  }

  const model = await promptModelPreferences(identity, existing, { modelStatusOptions });
  const preferences = writeCliPreferences(identity.root, { trustedDirectory, runtime, terminal, ...model });
  outro(`Ready · ${identity.project}`);
  return { identity, preferences };
}
