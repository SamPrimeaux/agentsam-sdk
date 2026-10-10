/**
 * Independent SAM script operations. No new terminal daemon.
 * The host must inject authorized scriptStore and ExecOS/agentsamd process runner.
 */
function deny(msg) {const e=new Error(msg); e.code=msg;throw e;}
function context(ctx) {if(!ctx?.accountId||!ctx?.actorId||!ctx?.installationId)deny('trusted_identity_required');return ctx;}
export function createScriptHandlers({ scriptStore, processRuntime } = {}) {
  const handlers={};
  if (scriptStore?.saveVersion && scriptStore?.getVersion) {
    handlers['sam.script.save'] = async (input, ctx) => {
      context(ctx);
      if (!String(input.script||'').trim()) deny('script_source_required');
      const result=await scriptStore.saveVersion({
        accountId:ctx.accountId,actorId:ctx.actorId,installationId:ctx.installationId,
        scriptId:input.scriptId||null,expectedVersion:input.expectedVersion||null,
        script:input.script,description:input.description||null,
      });
      if (!result?.scriptId||!Number.isInteger(result.version))deny('invalid_script_store_result');
      return {ok:true,scriptId:result.scriptId,version:result.version,artifactRef:result.artifactRef||null};
    };
    handlers['sam.script.get'] = async (input, ctx) => {
      context(ctx);
      const result=await scriptStore.getVersion({accountId:ctx.accountId,actorId:ctx.actorId,installationId:ctx.installationId,scriptId:input.scriptId,version:input.version||null});
      if (!result?.script || !result?.scriptId)deny('script_not_found_or_forbidden');
      return {ok:true,...result};
    };
  }
  if (processRuntime?.executeScript) {
    handlers['sam.superbash'] = async (input, ctx) => {
      context(ctx);
      let script=input.script;
      if (!script && input.scriptArtifactRef) {
        if (!scriptStore?.getByArtifactRef) deny('script_artifact_store_unavailable');
        const found=await scriptStore.getByArtifactRef({accountId:ctx.accountId,actorId:ctx.actorId,
          installationId:ctx.installationId,artifactRef:input.scriptArtifactRef});
        if (!found?.script)deny('script_artifact_not_found_or_forbidden');
        script=found.script;
      }
      if (!String(script||'').trim())deny('script_source_required');
      // Trusted laneRef is NOT model input. Runtime resolves authorized lane/workspace.
      const result=await processRuntime.executeScript({
        accountId:ctx.accountId,actorId:ctx.actorId,installationId:ctx.installationId,
        script,relativeCwd:input.relativeCwd||'.',idempotencyKey:input.idempotencyKey||null,
        laneRef:ctx.authorizedLaneRef||null,signal:ctx.signal,
        onEvent:ctx.onEvent,
      });
      if (!result?.executionId || !result?.status) deny('invalid_process_runtime_result');
      if (result.status==='failed' || result.status==='cancelled' || Number(result.exitCode)>0) {
        const e=new Error('script_execution_'+result.status);e.code='script_execution_failed';e.result=result;throw e;
      }
      return {ok:true,...result};
    };
  }
  return handlers;
}
