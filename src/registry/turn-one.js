/** Exact *pre-provider* payload evidence: never log automatically. */
import fs from 'node:fs';
import path from 'node:path';

export function preparedTurnOne(input) {
  return {
    schema:'agentsam.agent.turn-one.v1',
    stage:'pre-provider-adapter',
    source:input.source,
    model:input.model,
    provider:input.provider,
    instructions:input.instructions ?? null,
    messages:input.messages ?? null,
    tools:input.tools ?? [],
    skills:input.skills ?? [],
    workspace:input.workspace ?? null,
    context_receipt:input.context_receipt ?? null,
  };
}

export function saveTurnOneLocally(filename, report) {
  if (!path.isAbsolute(filename)) throw new Error('turn_one_audit_requires_absolute_path');
  // Explicit operator-only feature. No automatic dumps and no workspace
  // checked-in artifacts; the file includes potentially sensitive context.
  if (fs.existsSync(filename)) throw new Error('turn_one_audit_file_exists');
  fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
  return {path:filename,bytes:fs.statSync(filename).size};
}

export function comparePreparedTurns(a,b) {
  const projection=(r)=>({
    source:r.source,stage:r.stage,provider:r.provider,model:r.model,
    system_chars:typeof r.instructions==='string' ? r.instructions.length : JSON.stringify(r.instructions||'').length,
    message_count:Array.isArray(r.messages)?r.messages.length:0,
    message_roles:Array.isArray(r.messages)?r.messages.map(x=>x.role):[],
    tool_names:Array.isArray(r.tools)?r.tools.map(x=>x.name||x.function?.name).filter(Boolean).sort():[],
    tool_schema_chars:JSON.stringify(r.tools||[]).length,
    skill_count:Array.isArray(r.skills)?r.skills.length:0,
    workspace_chars:JSON.stringify(r.workspace||'').length,
    context_receipt:r.context_receipt||null,
  });
  const left=projection(a),right=projection(b);
  const changed=Object.keys(left).filter(key=>JSON.stringify(left[key])!==JSON.stringify(right[key]));
  return {schema:'agentsam.agent.turn-one.diff.v1',left,right,changed};
}
