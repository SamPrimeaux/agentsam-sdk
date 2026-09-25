/**
 * Catalog-backed dispatch bootstrap.
 * Full cli.js cutover is incremental — this module is the target authority for handlers.
 */

import { getCliCommand, printAssistTip, suggestCliCommands } from './command-catalog.js';

/** @type {Record<string, () => Promise<(argv: string[]) => unknown>>} */
const HANDLERS = {
  codebaseindex: async () => (await import('../commands/codebaseindex.js')).runCodebaseindex,
  ingest: async () => (await import('../commands/codebaseindex.js')).runCodebaseindex,
  'codebase-index': async () => (await import('../commands/codebaseindex.js')).runCodebaseindex,
  skill: async () => (await import('../commands/skill.js')).runSkill,
  skills: async () => (await import('../commands/skills.js')).runSkills,
};

/**
 * @param {string} command
 * @param {string[]} rest
 * @param {{ reportError?: (e: Error) => void }} [ctx]
 */
export async function dispatchCatalogCommand(command, rest = [], ctx = {}) {
  const entry = getCliCommand(command);
  if (!entry) {
    const suggestions = suggestCliCommands(command);
    const err = new Error(`Unknown command: ${command}`);
    err.code = 'AGENTSAM_UNKNOWN_COMMAND';
    err.suggestions = suggestions;
    throw err;
  }

  printAssistTip(entry, { json: rest.includes('--json') });

  const loader = HANDLERS[entry.id] || HANDLERS[command];
  if (!loader) {
    const err = new Error(`Catalog entry "${entry.id}" is not yet wired to a lazy handler (legacy cli.js path).`);
    err.code = 'AGENTSAM_HANDLER_NOT_MIGRATED';
    err.entry = entry;
    throw err;
  }

  const run = await loader();
  return run(rest);
}

export function listDispatchableCommands() {
  return Object.keys(HANDLERS);
}
