import { configureCliPreferences } from './preferences.js';
import { runShell } from './shell.js';
import { detectCliProject, readCliPreferences } from '../lib/cli-preferences.js';
import { runBootScene } from '../ui/boot.js';
import { select, isCancel } from '@clack/prompts';
import { discoverProjectCapabilities } from '../agent/project-discovery.js';

export async function runInteractive(options = {}) {
  let identity = detectCliProject(options.cwd || process.cwd());
  let preferences = readCliPreferences(identity.root);

  const firstRun = !preferences || preferences.trustedDirectory !== true;
  if (firstRun) {
    const configured = await configureCliPreferences({ cwd: identity.root, firstRun: true });
    identity = configured.identity;
    preferences = configured.preferences;
  }

  if (firstRun && preferences?.trustedDirectory === true && process.stdin.isTTY && !options.skipDiscovery) {
    const found = discoverProjectCapabilities(identity.root);
    if (found.signals.length) {
      console.log('\n  Existing project systems detected: ' + found.signals.map(x => x.id).join(', '));
      const choice = await select({
        message: 'Review how AgentSam can reuse this project’s existing tools?',
        options: [
          {value:'review',label:'Show read-only recommendations'},
          {value:'skip',label:'Continue without setup changes'},
        ],
      });
      if (!isCancel(choice) && choice === 'review') {
        for (const item of found.suggestions) console.log('  ' + item.id + ': ' + item.message);
        console.log('  No provider, index, deploy or workspace settings were changed.\n');
      }
    }
  }
  await runBootScene({ identity, preferences, animate: options.animate !== false });
  await runShell([], { cwd: identity.root, intro: 'quiet' });
}
