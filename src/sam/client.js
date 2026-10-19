import { getSamOperation, listSamOperations, toSamOperationCard } from './registry.js';
import { buildSamResult } from './result.js';
import { ensureOS } from './os.js';
import { validateSamInput } from './validation.js';
import { evaluate as evaluateSamDecisions } from './decision/evaluate.js';

// Runtime-owned observation, never evidence handed in by the caller.
const observedReceipts = new WeakMap();

/**
 * Resolve root/cwd from common input shapes.
 * @param {unknown} input
 */
function resolveRoot(input, fallbackRoot = process.cwd()) {
  if (input == null) return fallbackRoot;
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    const o = /** @type {Record<string, unknown>} */ (input);
    if (typeof o.root === 'string') return o.root;
    if (typeof o.cwd === 'string') return o.cwd;
    if (typeof o.projectRoot === 'string') return o.projectRoot;
  }
  return fallbackRoot;
}

/**
 * AgentSamClient — public facade over Systematic Autonomous Machinery (SAM).
 *
 * `sam` is the conventional variable name for this client. It is machinery,
 * not a human identity.
 *
 * @example
 * import { AgentSamClient } from '@inneranimalmedia/agentsam-sdk';
 * const sam = new AgentSamClient();
 * const result = await sam.invoke('repository.inspect', { root: '.' });
 */
export class AgentSamClient {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] Explicit platform credential (AGENTSAM_API_KEY). Local ops do not require it.
   * @param {string} [options.cwd]
   * @param {Record<string, string|undefined>} [options.env]
   * @param {boolean} [options.autoSeed=true]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? options.env?.AGENTSAM_API_KEY ?? process.env.AGENTSAM_API_KEY ?? null;
    // ACP remains the durable run authority; never build a second run store.
    this.controlPlane = options.controlPlane || null;
    // A host-scoped capability adapter is opt-in; never borrow another app's authority.
    this.capabilityAdapter = options.capabilityAdapter || null;
    this.authorizeCapability = options.authorizeCapability || null;
    observedReceipts.set(this, new Map());
    this.os = options.os || null;
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    if (!this.os && options.autoSeed !== false) {
      ensureOS();
    }

    /** Domain projections → sam.invoke(canonicalId, …) */
    this.projects = Object.freeze({
      list: opts => this.invoke('project.list',{},opts),
      get: (id,opts) => this.invoke('project.get',{id},opts),
      create: (input,opts) => this.invoke('project.create',input,opts),
      edit: (input,opts) => this.invoke('project.edit',input,opts),
      delete: (input,opts) => this.invoke('project.delete',input,opts),
      restore: (input,opts) => this.invoke('project.restore',input,opts),
    });
    this.databases = Object.freeze({
      sqlite:Object.freeze({
        list: opts => this.invoke('agentsam_sqlite_list',{},opts),
        get: (name,opts) => this.invoke('agentsam_sqlite_get',{name},opts),
        create: (input,opts) => this.invoke('agentsam_sqlite_create',input,opts),
        edit: (input,opts) => this.invoke('agentsam_sqlite_edit',input,opts),
        delete: (input,opts) => this.invoke('agentsam_sqlite_delete',input,opts),
        restore: (input,opts) => this.invoke('agentsam_sqlite_restore',input,opts),
      }),
      d1:Object.freeze({
        list: opts => this.invoke('agentsam_cf_d1_list',{},opts),
        create: (input,opts) => this.invoke('agentsam_d1_create',input,opts),
      }),
    });
    this.repository = {
      inspect: (input = {}, opts) => this.invoke('repository.inspect', normalizeRootInput(input, this.cwd), opts),
    };
    this.brand = {
      scan: (input = {}, opts) => this.invoke('brand.scan', normalizeRootInput(input, this.cwd), opts),
    };
    this.security = {
      scan: (input = {}, opts) => this.invoke('security.scan', normalizeRootInput(input, this.cwd), opts),
    };
    this.terminal = {
      exec: (input = {}, opts) => this.invoke('terminal.exec', input, opts),
    };
    this.cad = {
      blender: {
        inspect: (input = {}, opts) => this.invoke('cad.blender.inspect', input, opts),
      },
    };
    this.codebaseindex = {
      ingest: (input = {}, opts) => this.invoke('codebaseindex.ingest', normalizeRootInput(input, this.cwd), opts),
    };
    this.decision = {
      evaluate: (input = {}, opts) => this.invoke('decision.evaluate', input, opts),
    };
    this.artifacts = {
      render: (input = {}, opts) => this.invoke('artifact.render', input, opts),
    };
    this.planning = {
      astar: (input = {}, opts) => this.invoke('planning.astar', input, opts),
      goap: (input = {}, opts) => this.invoke('planning.goap', input, opts),
    };
  }

  /**
   * Report what this host actually knows, not what the global manifest promises.
   * Authorization is actor/request-specific and must be rechecked at invocation.
   */
  async status(operationId) {
    if (!this.os) ensureOS();
    const def = this.os ? this.os.get(operationId) : getSamOperation(operationId);
    if (!def && this.capabilityAdapter) {
      const adapter=this.capabilityAdapter;
      let reported=null;
      try {
        const row=await adapter.invoke('capability.status',{id:operationId});
        reported=row?.result||row;
      } catch { /* no claim without host readiness */ }
      const bound=adapter.canInvoke(operationId)===true;
      const observed=observedReceipts.get(this).get(operationId)||null;
      const readiness=reported?.readiness||'unverified';
      const fresh=Boolean(observed && Date.now()-Date.parse(observed.completed_at)<60_000);
      let effect='unknown';
      try { effect=adapter.describe(operationId)?.side_effects||'unknown'; } catch {}
      const readOnly=['none','network-read'].includes(effect);
      return {
        schema:'sam.capability.readiness.v1',id:operationId,
        declared:Boolean(reported?.id||reported?.capability_id),
        registered:Boolean(reported?.id||reported?.capability_id),bound,
        authorized:null,authorization_state:'requires_execution_check',
        available:bound && (readiness==='available'||fresh),
        verified:Boolean(observed),ready:bound && readOnly && fresh,
        readiness:!bound?'unavailable':fresh?'available':readiness,
        reason:!bound?'capability_handler_unavailable':fresh?null:reported?.reason||null,
        evidence_refs:observed?[observed.id]:[],last_verified_at:observed?.completed_at||null,
      };
    }
    if (!def) return {
      schema:'sam.capability.readiness.v1',id:operationId,declared:false,registered:false,bound:false,
      authorized:null,available:false,verified:false,ready:false,readiness:'unavailable',
      reason:'sam_operation_not_registered',
    };
    const needsRemote = def.execution.network === 'required' ||
      def.execution.model === 'required' || def.auth?.account === true ||
      def.execution.sideEffects === 'remote_read';
    const needsApproval = !['none','remote_read'].includes(def.execution.sideEffects);
    const actual = observedReceipts.get(this).get(operationId) || null;
    return {
      schema:'sam.capability.readiness.v1',id:def.id,version:def.version,declared:true,registered:true,bound:true,
      authorized:null,authorization_state:'requires_execution_check',available:!needsRemote,
      verified:Boolean(actual),ready:!needsRemote && !needsApproval,
      readiness:needsRemote?'unverified':needsApproval?'needs_approval':'available',
      reason:needsRemote?'dependency_not_probed':needsApproval?'request_authorization_required':null,
      evidence_refs:actual?[actual.id]:[], last_verified_at:actual?.completed_at||null,
    };
  }

  /**
   * Evaluate real SAM choose/check/score machinery; does not grant permission.
   * Questions can be registered arrays or keyed typed descriptors.
   */
  async decide({ state = {}, questions, policy = {}, receipt = true, evaluators } = {}) {
    const qs = Array.isArray(questions) ? questions : Object.entries(questions || {}).map(([id,q]) =>
      (typeof q==='string'?{id,type:q}:{...q,id}));
    // Existing evaluator handles validated questions and raises explicit
    // no-evaluator errors rather than silently calling a language model.
    return evaluateSamDecisions({state,questions:qs,policy,receipt,evaluators});
  }

  /**
   * Create a durable ACP run. Only a configured host can schedule actual work.
   * Starting a run is not the same as completing its requested operations.
   */
  async run(request = {}) {
    if (!this.controlPlane || typeof this.controlPlane.start !== 'function' ||
        typeof this.controlPlane.getRun !== 'function') {
      const e=new Error('sam_acp_host_not_configured');e.code='sam_acp_host_not_configured';throw e;
    }
    if (!request || typeof request.goal !== 'string' || !request.goal.trim())
      throw new TypeError('sam_run_goal_required');
    const start = await this.controlPlane.start({
      objective:request.goal,source_client:'agentsam-sdk',surface:request.surface||'sdk',
      metadata:{requested_operations:Array.isArray(request.operations)?request.operations:[],
        requested_deliverables:request.deliverables||null,context:request.context||{}},
    });
    const run = start?.run || start;
    const runId=run?.id || run?.run_id;
    if (!runId) throw new Error('sam_acp_run_missing_id');
    const control=this.controlPlane;
    const handle = {
      id:runId, status:run.status, schema:'sam.run.handle.v1',
      get:()=>control.getRun(runId),
      events:(options={})=>control.events(runId,options),
      cancel:()=>control.cancel(runId),
      async wait({maxAttempts=60,intervalMs=1000,signal}={}) {
        const terminal=new Set(['completed','failed','cancelled','timed_out']);
        for(let attempt=0;attempt<maxAttempts;attempt++){
          if(signal?.aborted) throw Object.assign(new Error('sam_run_wait_cancelled'),{code:'sam_run_wait_cancelled'});
          const state=await control.getRun(runId);
          if(state && terminal.has(state.status)){
            const receipt=typeof control.receipt==='function'?await control.receipt(runId):null;
            return {id:runId,status:state.status,run:state,receipt,
              deliverables:[],note:'Only executor-persisted artifacts may be included; request alone never creates a report.'};
          }
          if(attempt+1<maxAttempts) await new Promise(resolve=>setTimeout(resolve,intervalMs));
        }
        throw Object.assign(new Error('sam_run_wait_timeout'),{code:'sam_run_wait_timeout'});
      },
    };
    return Object.freeze(handle);
  }

  /** Replay existing ACP run events, preserving their event sequence. */
  async events(runId, options={}) {
    if(!this.controlPlane || typeof this.controlPlane.events!=='function')
      throw Object.assign(new Error('sam_acp_host_not_configured'),{code:'sam_acp_host_not_configured'});
    return this.controlPlane.events(runId,options);
  }

  /**
   * Delegate to a supplied host-backed operation adapter. No ambient cloud
   * credentials, no raw SQL fallback, and no automatic write approval.
   */
  async #invokeHostCapability(id,input,options={}) {
    const start=new Date().toISOString();
    const adapter=this.capabilityAdapter;
    let spec;
    try { spec=adapter.describe(id); } catch {
      return buildSamResult({operation:id,ok:false,data:null,startedAt:start,
        error:{code:'sam_host_contract_missing',message:'Host adapter has no contract'},status:'failed'});
    }
    const effects=String(spec.side_effects||'unknown');
    const readOnly=['none','network-read'].includes(effects);
    if(!readOnly){
      const approved=typeof this.authorizeCapability==='function' &&
        await this.authorizeCapability({id,input,side_effects:effects,contract:spec})===true;
      if(!approved)return buildSamResult({
        operation:id,ok:false,data:null,startedAt:start,
        error:{code:'sam_host_approval_required',message:'Explicit host operation approval is required'},
        status:'failed',sideEffects:[effects],
      });
    }
    try{
      const raw=await adapter.invoke(id,input);
      const data=raw?.result ?? raw;
      const failed=raw?.ok===false || data?.ok===false;
      const result=buildSamResult({
        operation:id,module:spec.domain||'host',ok:!failed,data,
        startedAt:start,lane:id.startsWith('agentsam_d1_')||id==='agentsam_cf_d1_list'?'mcp':'local',
        deterministic:spec.deterministic===true,modelUsed:false,
        sideEffects:effects==='none'?[]:[effects],input,
        ...(failed?{status:'failed',error:{code:String(data?.error||raw?.error||'sam_host_operation_failed')}}:{}),
      });
      if(result.ok && result.receipt.output_hash){
        observedReceipts.get(this).set(id,{
          id:result.receipt.id,completed_at:result.receipt.completed_at,
          hash:result.receipt.output_hash,
        });
      }
      return result;
    }catch(error){
      return buildSamResult({
        operation:id,module:spec.domain||'host',ok:false,data:null,startedAt:start,
        lane:'local',sideEffects:effects==='none'?[]:[effects],
        error:{code:error?.code||'sam_host_operation_failed',message:String(error?.message||error).slice(0,500)},
        status:'failed',
      });
    }
  }

  /**
   * Universal SAM execution doorway.
   * @param {string} operationId
   * @param {unknown} [input]
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {Record<string, unknown>} [options.execution]
   * @returns {Promise<import('./types.js').SamResult>}
   */
  async invoke(operationId, input = {}, options = {}) {
    if (!this.os) ensureOS();
    const def = this.os ? this.os.get(operationId) : getSamOperation(operationId);
    if (!def && this.capabilityAdapter?.canInvoke?.(operationId)) {
      return this.#invokeHostCapability(operationId,input,options);
    }
    if (!def) {
      return buildSamResult({
        operation: operationId,
        ok: false,
        data: null,
        startedAt: new Date().toISOString(),
        error: { code: 'sam_operation_not_found', message: `Unknown operation: ${operationId}` },
        status: 'failed',
      });
    }

    const startedAt = new Date().toISOString();
    const deterministic = def.execution.model === 'never';
    const sideEffects = def.execution.sideEffects === 'none' ? [] : [def.execution.sideEffects];
    /** @type {import('./types.js').SamOperationContext} */
    const ctx = {
      signal: options.signal,
      execution: options.execution,
      cwd: this.cwd,
      env: this.env,
    };

    try {
      if (def.input_schema && typeof def.input_schema === 'object') {
        validateSamInput(input, def.input_schema);
      }
      const data = await def.handler(input, ctx);
      const warnings = Array.isArray(/** @type {any} */ (data)?.warnings)
        ? /** @type {any} */ (data).warnings
        : undefined;
      // A domain handler can report a structured failure without throwing.
      // Never promote { ok: false } into an apparently successful SAM receipt.
      const failed = data && typeof data === 'object' && data.ok === false;
      const domainError = failed ? data.error : null;
      const failureCode = typeof domainError === 'object' && domainError?.code
        ? domainError.code : (typeof domainError === 'string' ? domainError : 'sam_operation_failed');
      const outcome = buildSamResult({
        operation: def.id,
        module: def.module,
        ok: !failed,
        ...(failed ? { error: {
          code: failureCode,
          message: typeof domainError === 'object' && domainError?.message
            ? domainError.message : String(domainError || 'Operation reported failure'),
        }, status: 'failed' } : {}),
        data,
        startedAt,
        lane: 'local',
        deterministic,
        modelUsed: false,
        sideEffects,
        input,
        warnings,
      });
      if (outcome.ok && outcome.receipt.status === 'completed' && outcome.receipt.output_hash) {
        observedReceipts.get(this).set(def.id, {
          id:outcome.receipt.id, completed_at:outcome.receipt.completed_at,
          hash:outcome.receipt.output_hash,
        });
      }
      return outcome;
    } catch (err) {
      return buildSamResult({
        operation: def.id,
        module: def.module,
        ok: false,
        data: null,
        startedAt,
        lane: 'local',
        deterministic,
        modelUsed: false,
        sideEffects,
        input,
        error: {
          code: err?.code || 'sam_operation_failed',
          message: err?.message || String(err),
        },
        status: options.signal?.aborted ? 'cancelled' : 'failed',
      });
    }
  }

  /**
   * Inspect operation metadata without executing.
   * @param {string} operationId
   * @param {{ schema?: boolean }} [options]
   */
  async describe(operationId, options = {}) {
    if (!this.os) ensureOS();
    const def = this.os ? this.os.get(operationId) : getSamOperation(operationId);
    if (!def && this.capabilityAdapter?.canInvoke?.(operationId)) {
      try { return {ok:true,...this.capabilityAdapter.describe(operationId),id:operationId,
        owner:'injected-capability-adapter'}; }
      catch { return {ok:false,error:{code:'sam_host_contract_missing'}}; }
    }
    if (!def) {
      return {
        ok: false,
        error: { code: 'sam_operation_not_found', message: `Unknown operation: ${operationId}` },
      };
    }
    const skillId = typeof def.skill === 'string' ? def.skill : def.skill?.id || null;
    const info = {
      ok: true,
      id: def.id,
      version: def.version,
      module: def.module,
      action: def.action,
      summary: def.summary,
      purpose: def.purpose || def.description,
      outcome: def.outcome || null,
      description: def.description,
      execution: { ...def.execution, lanes: [...def.execution.lanes] },
      auth: def.auth || {},
      risk: def.risk,
      accepts: def.accepts || [],
      phases: def.phases || [],
      artifacts: def.artifacts || [],
      capabilities: def.capabilities || [],
      skill: skillId,
      preview: def.preview || null,
      cli: def.cli || {},
      docs: def.docs || {},
      status: def.status || 'stable',
      input_schema: def.input_schema || null,
      output_schema: def.output_schema || null,
    };
    if (options.schema) {
      info.schemas_requested = true;
    }
    return info;
  }

  /**
   * Compact operation cards matching a query (substring / token match).
   * @param {{ query?: string, module?: string, model?: string, limit?: number }} [query]
   */
  async discover(query = {}) {
    if (!this.os) ensureOS();
    const q = String(query.query || '').trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const limit = Number.isInteger(query.limit) ? query.limit : 20;
    let cards = (this.os ? this.os.list() : listSamOperations()).map(toSamOperationCard);
    const known=new Set(cards.map(x=>x.id));
    if(this.capabilityAdapter?.list && this.capabilityAdapter?.canInvoke){
      for(const row of this.capabilityAdapter.list({status:null})){
        if(known.has(row.id)||!this.capabilityAdapter.canInvoke(row.id))continue;
        cards.push({
          id:row.id,module:row.domain||'host',
          action:row.id.split('.').at(-1),summary:row.description||row.id,
          model:row.model_required?'required':'never',
          risk:['none','network-read'].includes(row.side_effects)?'read_only':'write',
          network:row.side_effects==='network-read'?'required':'optional',
          side_effects:row.side_effects||'unknown',lanes:['host'],
          status:row.status||'stable',host_bound:true,cli:[],
        });
        known.add(row.id);
      }
    }
    if (query.module) {
      cards = cards.filter((c) => c.module === query.module);
    }
    if (query.model) {
      cards = cards.filter((c) => c.model === query.model);
    }
    if (tokens.length) {
      cards = cards
        .map((card) => {
          const hay = `${card.id} ${card.summary} ${card.module} ${card.action}`.toLowerCase();
          const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
          return { card, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
        .map((x) => x.card);
    }

    return {
      ok: true,
      count: Math.min(cards.length, limit),
      operations: cards.slice(0, limit),
    };
  }
}

/**
 * @param {unknown} input
 */
function normalizeRootInput(input, fallbackRoot = process.cwd()) {
  if (typeof input === 'string') {
    return { root: input };
  }
  if (input && typeof input === 'object') {
    const o = /** @type {Record<string, unknown>} */ (input);
    const root = resolveRoot(input, fallbackRoot);
    return { ...o, root, cwd: o.cwd ?? root };
  }
  return { root: fallbackRoot, cwd: fallbackRoot };
}

/** Convenience factory matching docs examples. */
export function createAgentSamClient(options) {
  return new AgentSamClient(options);
}
