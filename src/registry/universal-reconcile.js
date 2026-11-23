/**
 * Universal registry parity, read-only and account-aware.
 * This does not authorize execution. The host must verify every supplied
 * account/tenant/workspace/user ID before invoking the reconciler.
 */
const rows=async(db,sql,values=[])=>{
  if(!db?.prepare)throw Error('registry_d1_binding_missing');
  const answer=await db.prepare(sql).bind(...values).all();
  return answer?.results||[];
};
const compare=(found,expected,foundKey,sourceKey)=>{
  const index=new Map(found.map(v=>[String(foundKey(v)),v]));
  const expectedKeys=new Set(expected.map(v=>String(sourceKey(v))));
  return{
    source_count:expected.length,database_count:found.length,
    matched:expected.filter(v=>index.has(String(sourceKey(v)))).length,
    source_missing_in_d1:expected.filter(v=>!index.has(String(sourceKey(v)))).map(sourceKey),
    database_not_in_source:found.filter(v=>!expectedKeys.has(String(foundKey(v)))).map(foundKey),
  };
};
const missingScope=label=>({status:label+'_scope_required'});
export async function inspectUniversalRegistry(db,catalog,{
  accountId=null,tenantId=null,workspaceId=null,userId=null,
}={}){
  if(catalog?.schema!=='agentsam.universal-source-registry.v1')
    throw Error('universal_registry_source_invalid');

  const commands=await rows(db,
    'SELECT id,package_manager,package_name,package_version,executable,command_key,source_sha256,release_state,is_active FROM agentsam_commands_next');
  const [legacy]=await rows(db,'SELECT COUNT(*) AS n FROM agentsam_commands');
  const [backup]=await rows(db,'SELECT COUNT(*) AS n FROM agentsam_commands_legacy_snapshot_20261123');
  const tools=await rows(db,
    'SELECT tool_key,handler_key,handler_type,is_active,account_id FROM agentsam_tools WHERE account_id IS NULL'+
    (accountId?' OR account_id=?':''),
    accountId?[accountId]:[]);
  const platformSkills=await rows(db,
    "SELECT id,name,file_path,npm_package_name,npm_version,content_checksum,is_published,is_active FROM agentsam_skill_next WHERE scope_type='platform'");
  const accountSkillCount=accountId ? await rows(db,
    'SELECT COUNT(*) AS n FROM agentsam_skill WHERE account_id=?',[accountId]):null;

  // Never treat a workspace name as globally unique across tenants.
  const scripts=tenantId&&workspaceId?await rows(db,
    'SELECT slug,path,script_hash,is_active,safe_to_run,approval_required FROM agentsam_scripts WHERE tenant_id=? AND workspace_id=?',
    [tenantId,workspaceId]):null;
  const hooks=tenantId&&workspaceId&&userId?await rows(db,
    'SELECT hook_key,event_type,handler_type,is_active FROM agentsam_hook WHERE tenant_id=? AND workspace_id=? AND user_id=?',
    [tenantId,workspaceId,userId]):null;
  const rules=workspaceId&&userId?await rows(db,
    'SELECT rule_key,source_stored,is_active FROM agentsam_rules_document WHERE workspace_id=? AND user_id=?',
    [workspaceId,userId]):null;

  const workflows=await rows(db,
    'SELECT id,workflow_key,revision,scope_type,account_id,lifecycle,entry_node_key FROM agentsam_workflows '+
    (accountId?"WHERE scope_type='platform' OR account_id=?":"WHERE scope_type='platform'"),
    accountId?[accountId]:[]);
  const ids=workflows.map(w=>w.id);
  const placeholders=ids.map(()=>'?').join(',');
  const nodes=ids.length?await rows(db,
    'SELECT workflow_id,node_key,node_kind FROM agentsam_workflow_nodes WHERE workflow_id IN ('+placeholders+')',
    ids):[];
  const edges=ids.length?await rows(db,
    'SELECT workflow_id,from_node_key,to_node_key FROM agentsam_workflow_edges WHERE workflow_id IN ('+placeholders+')',
    ids):[];
  const triggers=await rows(db,'SELECT trigger_type,is_active,requires_approval FROM agentsam_workflow_triggers');
  const [runCount]=accountId?await rows(db,
    'SELECT COUNT(*) AS n FROM agentsam_workflow_runs WHERE account_id=?',[accountId]):[];
  const [hookCount]=tenantId&&workspaceId&&userId?await rows(db,
    'SELECT COUNT(*) AS n FROM agentsam_hook_execution WHERE tenant_id=? AND workspace_id=? AND user_id=?',
    [tenantId,workspaceId,userId]):[];
  const graphs=workflows.map(w=>{
    const localNodes=nodes.filter(n=>n.workflow_id===w.id),localEdges=edges.filter(e=>e.workflow_id===w.id);
    const nodeKeys=new Set(localNodes.map(n=>n.node_key));
    return{
      id:w.id,key:w.workflow_key,revision:w.revision,scope_type:w.scope_type,
      lifecycle:w.lifecycle,nodes:localNodes.length,edges:localEdges.length,
      entry_valid:!!w.entry_node_key&&nodeKeys.has(w.entry_node_key),
      dangling_edges:localEdges.filter(e=>!nodeKeys.has(e.from_node_key)||!nodeKeys.has(e.to_node_key)).length,
    };
  });
  const commandById=new Map(commands.map(x=>[x.id,x]));
  const cmdMismatches=catalog.commands.filter(c=>{
    const x=commandById.get(c.id);
    return x&&(x.source_sha256!==c.source_sha256||x.package_name!==c.package_name||
      x.package_version!==c.package_version);
  }).map(x=>x.id);
  const skillByPath=new Map(platformSkills.map(x=>[x.file_path,x]));
  const skillMismatches=catalog.skills.filter(s=>{
    const x=skillByPath.get(s.source);
    return x&&(x.content_checksum!==s.content_checksum||
      x.npm_package_name!==s.npm_package_name||x.npm_version!==s.npm_source_version);
  }).map(x=>x.id);
  return{
    schema:'agentsam.universal-registry-reconciliation.v1',mode:'read_only',
    authority:accountId?'account_scoped':'platform_only',
    commands:{...compare(commands,catalog.commands,r=>r.id,c=>c.id),
      legacy_count:Number(legacy?.n||0),legacy_snapshot_count:Number(backup?.n||0),
      source_hash_mismatches:cmdMismatches,
      registered_verified:commands.filter(c=>c.release_state==='verified'&&Number(c.is_active)===1).length},
    tools:compare(tools,catalog.tools,r=>r.tool_key,s=>s.id),
    skills:{...compare(platformSkills,catalog.skills,r=>r.file_path,s=>s.source),
      source_hash_mismatches:skillMismatches,
      sdk_published:platformSkills.filter(s=>Number(s.is_published)===1).length,
      account_legacy_count:accountSkillCount?Number(accountSkillCount[0]?.n||0):null},
    scripts:scripts?compare(scripts,catalog.scripts,r=>r.path,s=>s.source):missingScope('tenant_workspace'),
    hooks:hooks?compare(hooks,catalog.hooks,r=>r.hook_key,s=>s.id):missingScope('tenant_workspace_user'),
    rules:rules?compare(rules,catalog.rules,r=>r.source_stored,s=>s.source):missingScope('workspace_user'),
    workflows:{definitions:graphs,trigger_types:triggers,
      note:'D1 versioned graph definitions; scripts never become runnable workflows automatically'},
    execution_history:{
      workflow_runs:accountId?Number(runCount?.n||0):null,
      hook_executions:tenantId&&workspaceId&&userId?Number(hookCount?.n||0):null,
    },
    blockers:[
      'npm/PyPI exact artifact receipts required before CLI publication',
      'skills need tarball inclusion proof; not all source skills ship',
      'tool/script/hook/rule handlers require verified authorization',
      'workflow active definitions and run history must remain immutable',
    ],
  };
}
