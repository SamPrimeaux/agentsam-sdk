#!/usr/bin/env node
import { runBrandAssetCommand, runBrandPromoteWizard } from '../src/index.js';
import { cancel, confirm, intro, isCancel, note, outro, select, text } from '@clack/prompts';

const code = await runBrandAssetCommand(process.argv.slice(2), {
  runWizard: runBrandPromoteWizard,
  prompts: { intro, outro, cancel, isCancel, select, text, confirm, note },
});
process.exitCode = typeof code === 'number' ? code : 0;
