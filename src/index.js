// @inneranimalmedia/agentsam-sdk — public API

import pkg from '../package.json' with { type: 'json' };

export { AgentSam } from './AgentSam.js';
export { routeIntent } from './lib/router.js';
export { getToolCatalog } from './lib/tools.js';
export { scaffoldProject } from './lib/scaffold.js';
export {
  SLASH_COMMANDS,
  SHELL_THEMES,
  SHELL_PHASES,
  listSlashCommands,
} from './lib/slash-commands.js';

export {
  createIdentityClient,
  createIdentity,
  GoogleProvider,
  GithubProvider,
  GcpProvider,
  EmailProvider,
  getIdentityProvider,
  listIdentityProviders,
} from '../packages/identity/src/index.js';

export const version = pkg.version;
export const name = pkg.name;
