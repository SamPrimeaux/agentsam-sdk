#!/usr/bin/env node
import fs from 'node:fs';
import { createHookRuntimeFromConfig, findHookConfig, loadHookConfig } from '../src/index.js';

function usage() {
  return `AgentSam Hooks\n\nUsage:\n  agentsam-hooks validate [config]\n  agentsam-hooks list [config]\n  agentsam-hooks invoke <hook> [config]\n\n'invoke' reads one JSON object from stdin and writes one JSON dispatch result.\nConfig discovery checks agentsam.hooks.json and .agentsam/hooks.json from cwd upward.\n`;
}

function resolveConfig(argument) {
  const filename = argument || findHookConfig(process.cwd());
  if (!filename) throw new Error('No AgentSam hook config found. Pass a config path or create .agentsam/hooks.json.');
  return filename;
}

async function readStdin() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function main(argv) {
  const [command, ...args] = argv;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  if (command === 'validate') {
    const filename = resolveConfig(args[0]);
    const config = loadHookConfig(filename);
    process.stdout.write(`${JSON.stringify({ ok: true, schema: config.schema, source: config.source, adapters: Object.keys(config.adapters).length, hooks: Object.values(config.hooks).reduce((sum, rows) => sum + rows.length, 0) }, null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    const filename = resolveConfig(args[0]);
    const { runtime, config } = createHookRuntimeFromConfig(filename);
    process.stdout.write(`${JSON.stringify({ schema: config.schema, source: config.source, hooks: runtime.list() }, null, 2)}\n`);
    return;
  }
  if (command === 'invoke') {
    const hook = args[0];
    if (!hook) throw new Error('invoke requires a hook event');
    const filename = resolveConfig(args[1]);
    fs.accessSync(filename, fs.constants.R_OK);
    const { runtime } = createHookRuntimeFromConfig(filename);
    const payload = await readStdin();
    const isEnvelope = payload?.schema === 'agentsam.hook.v1';
    const result = await runtime.dispatch(
      hook,
      isEnvelope ? payload.input || {} : payload,
      isEnvelope ? payload.invocation || {} : {},
      { cwd: isEnvelope ? payload.cwd : process.cwd() },
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`agentsam-hooks: ${error.message}\n`);
  process.exitCode = 1;
});
