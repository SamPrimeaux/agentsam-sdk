// @inneranimalmedia/agentsam-sdk — public API

import pkg from '../package.json' with { type: 'json' };

export { AgentSam } from './AgentSam.js';
export { routeIntent } from './lib/router.js';
export { getToolCatalog } from './lib/tools.js';
export { scaffoldProject } from './lib/scaffold.js';
export {
  DEFAULT_DEPLOY_EXCLUDES,
  captureDeployReceipt,
  finalizeDeployReceipt,
  showLatestDeployReceipt,
  captureCheckpoint,
  promoteCheckpoint,
} from './lib/deploy-receipt/index.js';
export {
  normalizeGitRemote,
  resolveGitContext,
  tryResolveGitContext,
} from './lib/git-context.js';
export {
  resolveAgentSamBaseUrl,
  resolveBridgeKey,
  buildBridgeHeaders,
  createBridgeClient,
} from './lib/bridge-client.js';
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
  AuthError,
  AUTH_COOKIE_NAME,
  buildSessionKvPayload,
  isInboundOAuthSuccess,
  finalizeInboundOAuth,
} from '../packages/identity/src/index.js';

export const version = pkg.version;
export const name = pkg.name;
