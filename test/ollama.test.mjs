import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  OLLAMA_DEFAULTS,
  ollamaInstallPlan,
  parseOllamaArgs,
  probeOllama,
  resolveOllamaConfig,
  updateProjectOllamaConfig,
  upsertOllamaEnvFile,
} from '../src/commands/ollama.js';
import { createProjectManifest } from '../src/lib/project-config.js';

test('Ollama defaults are local-only and match the SDK local-dev contract', () => {
  assert.deepEqual(OLLAMA_DEFAULTS, {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5-coder',
    embedModel: 'mxbai-embed-large',
  });
  assert.deepEqual(resolveOllamaConfig({}, {}), OLLAMA_DEFAULTS);
});

test('Ollama setup args require explicit install/pull/start opt-ins', () => {
  assert.deepEqual(parseOllamaArgs(['setup']), {
    command: 'setup',
    cwd: process.cwd(),
    envFile: '',
    baseUrl: '',
    model: '',
    embedModel: '',
    install: false,
    start: false,
    pull: false,
    json: false,
  });
  const opted = parseOllamaArgs(['setup', '--install', '--start', '--pull', '--json']);
  assert.equal(opted.install, true);
  assert.equal(opted.start, true);
  assert.equal(opted.pull, true);
  assert.equal(opted.json, true);
});

test('setup env writer updates only canonical OLLAMA keys and preserves other config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-ollama-'));
  const envFile = path.join(root, '.env');
  fs.writeFileSync(envFile, 'EXISTING=value\nOLLAMA_MODEL=old\n');
  upsertOllamaEnvFile(envFile, OLLAMA_DEFAULTS);
  const text = fs.readFileSync(envFile, 'utf8');
  assert.match(text, /^EXISTING=value$/m);
  assert.match(text, /^OLLAMA_BASE_URL=http:\/\/127\.0\.0\.1:11434$/m);
  assert.match(text, /^OLLAMA_MODEL=qwen2\.5-coder$/m);
  assert.match(text, /^OLLAMA_EMBED_MODEL=mxbai-embed-large$/m);
  assert.equal((text.match(/^OLLAMA_MODEL=/gm) || []).length, 1);
});

test('project config records only portable Ollama capability metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-ollama-config-'));
  fs.mkdirSync(path.join(root, '.agentsam'));
  fs.writeFileSync(path.join(root, '.agentsam', 'config.json'), `${JSON.stringify(createProjectManifest({ projectName: 'demo', repositoryId: 'local:demo' }), null, 2)}\n`);
  const filename = updateProjectOllamaConfig(root, OLLAMA_DEFAULTS);
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(config.models.local.provider, 'ollama');
  assert.equal(config.models.local.base_url_env, 'OLLAMA_BASE_URL');
  assert.equal(config.models.local.model_env, 'OLLAMA_MODEL');
  assert.equal(config.models.local.embed_model_env, 'OLLAMA_EMBED_MODEL');
  assert.equal(JSON.stringify(config).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(config).includes('qwen2.5-coder'), false);
  assert.equal(JSON.stringify(config).includes('token'), false);
});

test('status probe recognizes configured chat and embedding models', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ models: [
    { name: 'qwen2.5-coder:latest' },
    { name: 'mxbai-embed-large:latest' },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const status = await probeOllama(OLLAMA_DEFAULTS, fakeFetch);
  assert.equal(status.online, true);
  assert.equal(status.chat_ready, true);
  assert.equal(status.embed_ready, true);
});

test('automatic install plans use local package managers, never a remote shell script', () => {
  assert.deepEqual(ollamaInstallPlan('darwin', { brew: true }), {
    command: 'brew', args: ['install', 'ollama'], manager: 'homebrew',
  });
  assert.equal(ollamaInstallPlan('linux', { brew: false }), null);
  assert.equal(ollamaInstallPlan('darwin', { brew: false }), null);
  const win = ollamaInstallPlan('win32', { winget: true });
  assert.equal(win.command, 'winget');
  assert.equal(win.args.includes('Ollama.Ollama'), true);
});
