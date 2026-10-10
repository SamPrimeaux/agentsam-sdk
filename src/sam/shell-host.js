/**
 * AgentSam interactive CLI host: bind actual local SAM media handlers to
 * the existing model-facing capability adapter, never directly to the model.
 * IAM user + account must be resolved from a valid local OAuth session.
 */
import path from 'node:path';
import { readAccountSession, isBrowserSessionExpired } from '../lib/account-session.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import { getJson } from '../lib/core-client.js';
import { createSamOS } from './os.js';
import { createSamCapabilityAdapter } from './model-adapter.js';
import { createLocalMediaStore } from './adapters/local-media-store.js';
import { createWorkspaceMediaImportOperation, projectInstallationId } from './adapters/workspace-media.js';

const LOCAL_MEDIA_OPERATIONS = Object.freeze([
  'media.local.import',
  'media.image.inspect',
  'media.image.background.remove',
  'media.image.optimize',
  'media.image.resize',
  'media.image.crop',
  'media.image.convert',
  'media.image.trim_alpha',
  'media.image.normalize_color',
  'media.model.inspect',
]);

/**
 * Resolve an API-key or OAuth principal through IAM, once per interactive turn.
 * Credentials never enter model arguments or tool definitions.
 */
export async function resolveShellSamIdentity({ state, authorityLoader = resolveAccountAuthority,
                                               contextLoader = getJson } = {}) {
  if (!state?.home || !state?.cwd) return null;
  try {
    const authority = await authorityLoader({ home:state.home, env:process.env });
    if (!authority?.value) return null;
    const context = await contextLoader('/api/sdk/context', {
      home:state.home, env:process.env, bearer:authority.value,
    });
    const actorId = context?.user_id;
    const accountId = context?.owner_account_id || context?.account_id;
    if (!actorId || !accountId) return null;
    return {
      accountId, actorId,
      installationId:projectInstallationId(path.resolve(state.projectRoot || state.cwd)),
    };
  } catch { return null; }
}

export function createShellSamAdapter({ state, authorize, trustedIdentity = null } = {}) {
  if (!state?.cwd || typeof authorize !== 'function') return null;
  const readTrustedIdentity = () => {
    const session = readAccountSession({home:state.home});
    if (session?.user_id && session.account_id && !isBrowserSessionExpired(session)) {
      return {
        accountId:session.account_id,actorId:session.user_id,
        installationId:projectInstallationId(path.resolve(state.projectRoot || state.cwd)),
      };
    }
    // Fallback for API-key users: principal was verified through IAM.
    return trustedIdentity;
  };
  // An API key without a verified actor identity is not a substitute for one.
  if (!readTrustedIdentity()) return null;
  const root = path.resolve(state.projectRoot || state.cwd);
  const assetStore = createLocalMediaStore({root:path.join(root,'.agentsam','media')});
  const permit = async ({operation,policy,input,identity}) => {
    if (!readTrustedIdentity()) return false;
    return (await authorize({capability_id:operation,input,descriptor:{
      side_effects: policy?.effect || 'local_write',
    }})) === true;
  };
  const samOS = createSamOS({core:true,generated:{
    assetStore,
    resolveTrustedContext: async () => {
      const principal = readTrustedIdentity();
      if (!principal) throw new Error('sam_authenticated_session_required');
      return principal;
    },
    authorize: permit,
  }});
  samOS.install([createWorkspaceMediaImportOperation({
    root,assetStore,
    resolveTrustedContext: async () => {
      const principal = readTrustedIdentity();
      if (!principal) throw new Error('sam_authenticated_session_required');
      return principal;
    },
    authorize: permit,
  })]);
  return createSamCapabilityAdapter({
    os:samOS,
    expose:LOCAL_MEDIA_OPERATIONS,
    // Provider dispatch performs a separate allowlist check. The bound
    // SAM handlers make the actual privileged auth decision above.
    authorize: async () => !!readTrustedIdentity(),
  });
}
