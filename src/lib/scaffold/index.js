/**
 * @inneranimalmedia/agentsam-sdk — scaffold system
 * Entry point for all guided scaffold wizards.
 *
 * Usage:
 *   npx @inneranimalmedia/agentsam-sdk scaffold
 *   npx @inneranimalmedia/agentsam-sdk scaffold cms
 *   npx @inneranimalmedia/agentsam-sdk scaffold worker-api
 */

import { intro, outro, select, cancel, isCancel, note } from '@clack/prompts';
import { runCmsWizard } from './wizards/cms.js';
import { runWorkerApiWizard } from './wizards/worker-api.js';
import pc from 'picocolors';

const SCAFFOLDS = {
  cms: {
    label: 'CMS Site',
    description: 'Cloudflare Worker + D1 + R2 with nav, pages, and reusable templates',
    run: runCmsWizard,
  },
  'worker-api': {
    label: 'Worker API',
    description: 'Bare Cloudflare Worker with typed route handlers and D1 binding',
    run: runWorkerApiWizard,
  },
};

export async function runScaffold(type) {
  intro(pc.bgCyan(pc.black(' Agent Sam Scaffold ')));

  // If a type was passed directly (e.g. `scaffold cms`), run it
  if (type && SCAFFOLDS[type]) {
    await SCAFFOLDS[type].run();
    outro(pc.green('Done. Files written — check the output above.'));
    return;
  }

  if (type && !SCAFFOLDS[type]) {
    note(`Unknown scaffold type: "${type}"\nAvailable: ${Object.keys(SCAFFOLDS).join(', ')}`, 'Error');
    process.exit(1);
  }

  // No type passed — show picker
  const choice = await select({
    message: 'What do you want to scaffold?',
    options: Object.entries(SCAFFOLDS).map(([value, { label, description }]) => ({
      value,
      label,
      hint: description,
    })),
  });

  if (isCancel(choice)) {
    cancel('Cancelled.');
    process.exit(0);
  }

  await SCAFFOLDS[choice].run();
  outro(pc.green('Done. Files written — check the output above.'));
}
