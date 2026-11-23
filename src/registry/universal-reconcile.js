/**
 * Read-only reconciler for source registry and existing platform D1.
 * The platform owns workspace/account authorization; caller must pass it.
 * No run history, scripts, workflows, hooks or rules are mutated by discovery.
 */
const list = async (db, sql, args=[]) => {
  if (!db?.prepare) throw new Error('registry_d1_binding_missing');
  const result = await db.prepare(sql).bind(...args).all();
  return result?.results || [];
};
const scoped = (rows,source,idOf,sourceOf) => {
  const installed=new Map(rows.map(r=>[String(idOf(r)),r]).filter(([k])=>k&&k!=='undefined'));
  const declared=new Set(source.map(s=>String(sourceOf(s))));
  return {
    source_count:source.length, database_count:rows.length,
    matched:source.filter(s=>installed.has(String(sourceOf(s)))).length,
    source_missing_in_d1:source.filter(s=>!installed.has(String(sourceOf(s)))).map(s=>sourceOf(s)),
    database_not_in_source:rows.filter(r=>!declared.has(String(idOf(r)))).map(r=>idOf(r)),
  };
};
export async function inspectUniversalRegistry(db, catalog, {
  accountId=null, workspaceId=null, userId=null,
}={}) {
  if (!catalog || catalog.schema!=='agentsam.universal-source-registry.v1') {
    throw new Error('universal_registry_source_invalid');
  }
  const commandRows=await list(db,
    'SELECT id,package_manager,package_name,package_version,executable,command_key,source_sha256,release_state,is_active FROM agentsam_commands_next');
  const legacy=await list(db,'SELECT COUNT(*) AS n FROM agentsam_commands');
  const legacyArchive=await list(db,'SELECT COUNT(*) AS n FROM agentsam_commands_legacy_snapshot_20261123');
  const tools=await list(db,
    'SELECT tool_key,handler_key,handler_type,is_active,account_id FROM agentsam_tools WHERE account_id IS NULL'+
    (accountId?' OR account_id = ?':''),
    accountId?[accountId]:[]);
  const skills=accountId ? await list(db,
    'SELECT id,name,slash_trigger,npm_package_name,npm_version,file_path,content_checksum,is_published,is_active FROM agentsam_skill WHERE account_id=?',
    [accountId]) : [];
  // Legacy workspace scripts, hooks and rules are NOT global capability grants.
  const scripts=workspaceId ? await list(db,
    'SELECT slug,path,script_hash,is_active,safe_to_run,approval_required FROM agentsam_scripts WHERE workspace_id=?',
    [workspaceId]) : [];
  const hooks=(workspaceId&&userId) ? await list(db,
    'SELECT hook_key,event_type,handler_type,is_active FROM agentsam_hook WHERE workspace_id=? AND user_id=?',
    [workspaceId,userId]) : [];
  const rules=(workspaceId&&userId) ? await list(db,
    'SELECT rule_key,source_stored,is_active FROM agentsam_rules_document WHERE workspace_id=? AND user_id=?',
    [workspaceId,userId]) : [];
  const workflowScope=accountId
    ? "WHERE scope_type='platform' OR account_id=?"
    : "WHERE scope_type='platform'";
  const workflows=await list(db,
    'SELECT id,workflow_key,revision,scope_type,account_id,lifecycle,entry_node_key FROM agentsam_workflows '+workflowScope,
    accountId?[accountId]:[]);
  const counts=await list(db,'SELECT '+
    '(SELECT COUNT(*) FROM agentsam_hook_execution) AS hook_executions,'+
    '(SELECT COUNT(*) FROM agentsam_workflow_nodes) AS workflow_nodes,'+
    '(SELECT COUNT(*) FROM agentsam_workflow_edges) AS workflow_edges,'+
    '(SELECT COUNT(*) FROM agentsam_workflow_runs) AS workflow_runs,'+
    '(SELECT COUNT(*) FROM agentsam_workflow_triggers) AS workflow_triggers');
  const cmdIndex=scoped(commandRows,catalog.commands,r=>r.id,c=>c.id);
  const stagedMismatches=catalog.commands.filter(row=>{
    const found=commandRows.find(dbRow=>dbRow.id===row.id);
    return found && (found.source_sha256!==row.source_sha256 ||
      found.package_name!==row.package_name || found.package_version!==row.package_version);
  }).map(row=>row.id);
  const toolIndex=scoped(tools,catalog.tools,r=>r.tool_key,s=>s.id);
  const skillIndex=accountId ? scoped(skills,catalog.skills,r=>r.name,s=>s.name) : null;
  return {
    schema:'agentsam.universal-registry-reconciliation.v1',
    mode:'read_only',authority:accountId?'account_scoped':'platform_only',
    commands:{...cmdIndex,legacy_count:Number(legacy[0]?.n||0),
      legacy_snapshot_count:Number(legacyArchive[0]?.n||0),
      source_hash_mismatches:stagedMismatches,
      registered_verified:commandRows.filter(r=>r.release_state==='verified'&&Number(r.is_active)===1).length},
    tools:toolIndex,
    skills:skillIndex || {status:'account_required',source_count:catalog.skills.length},
    scripts:workspaceId ? scoped(scripts,catalog.scripts,r=>r.path,s=>s.source) : {status:'workspace_required',source_count:catalog.scripts.length},
    hooks:workspaceId&&userId ? scoped(hooks,catalog.hooks,r=>r.hook_key,s=>s.id) : {status:'workspace_and_user_required',source_count:catalog.hooks.length},
    rules:workspaceId&&userId ? scoped(rules,catalog.rules,r=>r.source_stored,s=>s.source) : {status:'workspace_and_user_required',source_count:catalog.rules.length},
    workflows:{live:workflows,notes:'D1 versioned graphs are authoritative; do not infer runnable workflows from source scripts'},
    execution_history:counts[0]||{},
    blockers:[
      'legacy commands are slash/workspace commands, not portable CLI distribution records',
      'npm/PyPI release receipts required before marking command candidates verified',
      'agentsam_skill package-version uniqueness must be repaired before multi-skill SDK sync',
      'scripts, tools, hooks and rules need verified dispatch/permissions before activation',
      'active workflow graphs and run histories must remain immutable',
    ],
  };
}
