import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cancel, intro, isCancel, outro, select, text } from '@clack/prompts';
import { collectModelsStatus } from './models.js';
import { detectCliProject, readCliPreferences, writeCliPreferences } from '../lib/cli-preferences.js';

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

export function availableShells(env = process.env) {
  const values = [];
  const detected = path.basename(env.SHELL || env.ComSpec || '').trim();
  if (detected) values.push(detected);
  for (const shell of ['zsh', 'bash', 'fish', 'pwsh']) {
    if (!values.includes(shell) && commandExists(shell)) values.push(shell);
  }
  return values.length ? values : ['shell'];
}

function modelOptions(status) {
  const options = [{ value: 'auto', label: 'Automatic', hint: 'connected host/runtime decides' }];
  if (status.local?.online) {
    for (const row of status.local.models || []) {
      if (row?.name) options.push({ value: `ollama:${row.name}`, label: `Ollama · ${row.name}`, hint: 'local' });
    }
  }
  for (const provider of status.providers || []) {
    if (provider.configured) options.push({ value: `${provider.id}:auto`, label: provider.label, hint: 'provider configured' });
  }
  return options;
}

export async function configureCliPreferences({ cwd = process.cwd(), firstRun = false } = {}) {
  let identity = detectCliProject(cwd);
  const existing = readCliPreferences(identity.root) || {};
  intro(firstRun ? 'Welcome to Agent Sam' : 'Agent Sam settings');

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
      message: 'Project folder',
      placeholder: identity.root,
      defaultValue: identity.root,
      validate(value) {
        const resolved = path.resolve(String(value || ''));
        if (!fs.existsSync(resolved)) return 'Folder does not exist';
        if (!fs.statSync(resolved).isDirectory()) return 'Path is not a directory';
      },
    }));
    identity = detectCliProject(path.resolve(String(folder)));
  }

  const runtime = stopIfCancelled(await select({
    message: 'Runtime',
    initialValue: existing.runtime || 'local',
    options: [
      { value: 'local', label: 'Local machine', hint: 'real shell + filesystem' },
      { value: 'remote', label: 'Remote', hint: 'connected remote runtime' },
      { value: 'sandbox', label: 'Sandbox', hint: 'isolated disposable runtime' },
    ],
  }));

  const shells = availableShells();
  const terminal = stopIfCancelled(await select({
    message: 'Terminal',
    initialValue: existing.terminal && shells.includes(existing.terminal) ? existing.terminal : shells[0],
    options: shells.map((shell) => ({ value: shell, label: shell, hint: shell === shells[0] ? 'detected/default' : undefined })),
  }));

  let status = { providers: [], local: { online: false, models: [] } };
  try { status = await collectModelsStatus(); } catch { /* inventory is best-effort */ }
  const models = modelOptions(status);
  const initialModel = models.some((row) => row.value === existing.modelPreference) ? existing.modelPreference : 'auto';
  const modelPreference = stopIfCancelled(await select({
    message: 'Model preference',
    initialValue: initialModel,
    options: models,
  }));

  const preferences = writeCliPreferences(identity.root, { runtime, terminal, modelPreference });
  outro(`Ready · ${identity.project}`);
  return { identity, preferences };
}
