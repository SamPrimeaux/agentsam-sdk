import { configureCliPreferences } from './preferences.js';
import { runShell } from './shell.js';
import { detectCliProject, readCliPreferences } from '../lib/cli-preferences.js';
import { runBootScene } from '../ui/boot.js';

export async function runInteractive(options = {}) {
  let identity = detectCliProject(options.cwd || process.cwd());
  let preferences = readCliPreferences(identity.root);

  if (!preferences) {
    const configured = await configureCliPreferences({ cwd: identity.root, firstRun: true });
    identity = configured.identity;
    preferences = configured.preferences;
  }

  await runBootScene({ identity, preferences, animate: options.animate !== false });
  await runShell([], {
    cwd: identity.root,
    intro: 'quiet',
  });
}
