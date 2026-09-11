#!/usr/bin/env node

import { runTui } from './internal/ui-preview-runner.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log(`
Internal Agent Sam UI preview

  npm run ui:preview -- tour
  npm run ui:preview -- boot
  npm run ui:preview -- setup
  npm run ui:preview -- thinking
  npm run ui:preview -- ready
  npm run ui:preview -- ansi

This is an SDK design tool, not a public Agent Sam command.
`);
  process.exit(0);
}

if (args[0] === 'ansi') {
  await runTui(['ansi', '--scene', args[1] || 'all', ...args.slice(2)]);
} else if (args[0] === 'rich') {
  await runTui(['rich', ...args.slice(1)]);
} else {
  await runTui(['rich', '--scene', args[0], ...args.slice(1)]);
}
