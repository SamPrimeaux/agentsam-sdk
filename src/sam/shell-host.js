/**
 * AgentSam interactive CLI host: bind actual local SAM media handlers to
 * the existing model-facing capability adapter, never directly to the model.
 * IAM user + account must be resolved from a valid local OAuth session.
 */
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { terminalExec } from '../capabilities/terminal-exec.js';
import { createProcedureCatalog } from '@inneranimalmedia/primetech-procedures';
import { readAccountSession, isBrowserSessionExpired } from '../lib/account-session.js';
import { resolveAccountAuthority } from '../lib/auth.js';
import { getJson } from '../lib/core-client.js';
import { createSamOS } from './os.js';
import { AgentSamClient } from './client.js';
import { createSamCapabilityAdapter } from './model-adapter.js';
import { createLocalMediaStore } from './adapters/local-media-store.js';
import { createObjectMediaStore } from './adapters/object-media-store.js';
import { readMediaStorageSelection } from './media/environment.js';
import { createLocalScriptStore } from './adapters/local-script-store.js';
import { createLocalScriptRuntime, isLocalBashAvailable } from './adapters/local-script-runtime.js';
import { findOpenCvPython, createOpenCvVideoOperations } from './adapters/opencv-video.js';
import { createWorkspaceMediaImportOperation, projectInstallationId } from './adapters/workspace-media.js';
import { createPrimeTechCreativeOperations } from './packs/primetech-creative.js';

import { createCloudflareR2InventoryHandler, R2_INVENTORY_OPERATION } from './adapters/cloudflare-r2-inventory.js';

const LOCAL_SCRIPT_OPERATIONS = Object.freeze(['sam.script.save', 'sam.script.get', 'sam.superbash']);

const LOCAL_MEDIA_OPERATIONS = Object.freeze([
  'media.local.import',
  'media.asset.inspect',
  'media.image.inspect',
  'media.image.background.remove',
  'media.image.optimize',
  'media.image.resize',
  'media.image.crop',
  'media.image.convert',
  'media.image.trim_alpha',
  'media.image.normalize_color',
  'media.model.inspect',
  'media.model.validate',
  'media.video.inspect',
  'media.video.sample_frames',
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

export function createShellSamAdapter({ state, authorize, trustedIdentity = null, mediaBindings = null, procedureOperationIds = [], r2InventoryHandler = null } = {}) {
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
  const selection = readMediaStorageSelection(root);
  if (selection?.error) throw new Error(selection.error);
  // An explicit remote selection must never silently redirect writes to disk.
  const kind = selection?.kind || 'local';
  const objectBound = mediaBindings?.bucket?.get && mediaBindings?.bucket?.put &&
    mediaBindings?.bucket?.delete;
  const assetStore = kind === 'local'
    ? createLocalMediaStore({root:path.join(root,'.agentsam','media')})
    : objectBound && (kind === 'r2' || (kind === 'r2_d1' && mediaBindings?.index?.register))
      ? createObjectMediaStore({bucket:mediaBindings.bucket,
        index:kind === 'r2_d1' ? mediaBindings.index : null})
      : null;
  const scriptStore = createLocalScriptStore({home: state.home});
  const processRuntime = isLocalBashAvailable() ? createLocalScriptRuntime({root}) : null;
  const permit = async ({operation,policy,input,identity}) => {
    if (!readTrustedIdentity()) return false;
    return (await authorize({capability_id:operation,input,descriptor:{
      side_effects: ['read','platform_read','script_artifact_read'].includes(policy?.effect) ? 'none' : policy?.effect || 'local_write',
    }})) === true;
  };
  const samOS = createSamOS({core:true,generated:{
    assetStore, scriptStore, processRuntime, scriptExecutionLanes: ['local'],
    handlers: { [R2_INVENTORY_OPERATION]: r2InventoryHandler || createCloudflareR2InventoryHandler({home:state.home,root}) },
    resolveTrustedContext: async () => {
      const principal = readTrustedIdentity();
      if (!principal) throw new Error('sam_authenticated_session_required');
      return principal;
    },
    authorize: permit,
  }});
  samOS.install(createPrimeTechCreativeOperations({projectRoot:root}));
  if (assetStore) {
    const resolvePrincipal = async () => {
      const principal = readTrustedIdentity();
      if (!principal) throw new Error('sam_authenticated_session_required');
      return principal;
    };
    samOS.install([createWorkspaceMediaImportOperation({
      root, assetStore, resolveTrustedContext: resolvePrincipal, authorize: permit,
    })]);
    const opencvPython = findOpenCvPython();
    if (opencvPython) samOS.install(createOpenCvVideoOperations({
      assetStore, resolveTrustedContext: resolvePrincipal, authorize: permit,
      pythonExecutable: opencvPython,
    }));
  }
  const procedureAllow = new Set(procedureOperationIds.filter(id => !!samOS.get(id)));
  const procedureClient = new AgentSamClient({os:samOS,cwd:root});
  const modelAdapter = createSamCapabilityAdapter({
    os:samOS,
    // The model-facing adapter receives only installed local media/script tools
    // and packaged read-only SAM operations. Write-capable procedure operations
    // remain private and are invoked only after the procedure approval gate.
    expose:[...new Set([
      ...LOCAL_MEDIA_OPERATIONS, ...LOCAL_SCRIPT_OPERATIONS, R2_INVENTORY_OPERATION,
      ...procedureOperationIds.filter(id => {
        const op = samOS.get(id);
        return op?.risk === 'read_only' && op?.execution?.sideEffects === 'none';
      }),
    ])].filter(id => samOS.get(id)),
    authorize: async () => !!readTrustedIdentity(),
  });
  return Object.freeze({
    ...modelAdapter,
    canInvokeProcedureOperation: id => procedureAllow.has(id) && !!samOS.get(id),
    // Private package-bound argv invocation; never a model tool or arbitrary script.
    invokeProcedureFile: async request => {
      if (!readTrustedIdentity()) return { ok:false, error:{code:'sam_authenticated_session_required'} };
      const procedure = createProcedureCatalog().get(request.id, request.version);
      const { manifest, entrypointPath, entrypointSha256, manifestSha256 } = procedure;
      const kind = manifest.runtime.kind;
      if (!['python','bash'].includes(kind) || request.projectRoot !== fs.realpathSync(root) ||
          request.entrypointSha256 !== entrypointSha256 || request.manifestSha256 !== manifestSha256) {
        return { ok:false, error:{code:'primetech_file_runtime_binding_mismatch'} };
      }
      const available = name => String(process.env.PATH || '').split(path.delimiter).some(dir => {
        if (!path.isAbsolute(dir)) return false;
        try { fs.accessSync(path.join(dir,name),fs.constants.X_OK); return true; } catch { return false; }
      });
      const candidates = kind === 'bash' ? ['bash'] : (manifest.runtime.interpreter_candidates || ['python3.12','python3.11','python3.10','python3']);
      const command = candidates.find(available);
      if (!command) return {ok:false,error:{code:'primetech_interpreter_unavailable'}};
      const args = [...(kind === 'python' ? ['-B','-I','-S'] : ['--']),entrypointPath,JSON.stringify(request.input)];
      if (!await authorize({capability_id:'terminal.exec',input:{procedure_id:manifest.id,version:manifest.version,entrypoint_sha256:entrypointSha256,idempotency_key:request.idempotencyKey},descriptor:{side_effects:'local_write'}})) {
        return {ok:false,error:{code:'primetech_file_runtime_approval_required'}};
      }
      if (!readTrustedIdentity() || createHash('sha256').update(fs.readFileSync(entrypointPath)).digest('hex') !== entrypointSha256) return {ok:false,error:{code:'primetech_file_runtime_binding_mismatch'}};
      const started=Date.now();
      const result=await terminalExec({command,args,relative_cwd:'.'},{cwd:root});
      return {ok:true,data:{...result,status:result.ok?'completed':'failed',executionId:'pex_'+randomUUID().replaceAll('-',''),durationMs:Date.now()-started,scriptHash:createHash('sha256').update(JSON.stringify({command,args})).digest('hex')}};
    },
    invokeProcedureOperation: async (id,input={}) => {
      if (!procedureAllow.has(id) || !samOS.get(id)) {
        return {ok:false,error:{code:'sam_procedure_operation_unavailable',operation:id}};
      }
      if (!readTrustedIdentity()) {
        return {ok:false,error:{code:'sam_authenticated_session_required'}};
      }
      // This private path is reached only from the versioned procedure handler,
      // after its explicit workflow.execute approval. It is never model-listed.
      return procedureClient.invoke(id,input);
    },
  });
}
