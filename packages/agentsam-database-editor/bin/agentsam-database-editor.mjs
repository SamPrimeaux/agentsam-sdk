#!/usr/bin/env node
/**
 * Database Editor CLI stub — Phase 1 points users at Local Studio /database.
 */
const [cmd = 'help'] = process.argv.slice(2);

if (cmd === 'preview' || cmd === 'doctor' || cmd === 'info') {
  console.log(`
  AgentSam Database Editor

  Local Studio route:  /database
  Install:             curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app-id database-editor
  Vectors:             optional (default none)

  Open Local Studio and choose Database in the sidenav, or open the workbench Database panel.
`);
  process.exit(0);
}

console.log(`usage: agentsam-database-editor <preview|doctor|info>`);
process.exit(cmd === 'help' || cmd === '--help' ? 0 : 1);
