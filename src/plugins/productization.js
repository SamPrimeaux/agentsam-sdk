import fs from 'node:fs';
import path from 'node:path';

export const PLUGIN_PRODUCT_SCHEMA = 'agentsam.plugin-product/v1';
export const PLUGIN_QUALITY_EVIDENCE_SCHEMA = 'agentsam.plugin-quality-evidence/v1';
export const PLUGIN_QUALITY_RECEIPT_SCHEMA = 'agentsam.plugin-quality-receipt/v1';
export const PLUGIN_LIFECYCLE = Object.freeze(['available','installed','needs_connection','connected','ready']);

const PLATFORM_AUTHORITIES = Object.freeze([
  'identity.oauth',
  'vault.credentials',
  'settings.plugin-installation',
  'plugin-runtime.mcp',
  'plugin-runtime.health',
  'plugin-runtime.receipts',
  'plugin-runtime.retry',
]);

const FORBIDDEN_DOMAIN_OWNS = new Set([
  'oauth',
  'oauth_engine',
  'credentials',
  'credential_vault',
  'plugin_installer',
  'mcp_runtime',
  'settings_framework',
  'generic_health',
  'generic_receipts',
  'generic_retry',
]);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename,'utf8'));
}
function finding(severity,code,message){ return {severity,code,message}; }
function exists(root,name){ return fs.existsSync(path.join(root,name)); }

function requiredCheckMap(product,evidence){
  const checks={};
  for(const id of product?.verification?.requiredChecks||[]){
    checks[id]=evidence?.checks?.[id]||{status:'unverified'};
  }
  return checks;
}

export function inspectPluginProduct(target) {
  const root=path.resolve(target);
  const findings=[];
  const files={
    product:path.join(root,'agentsam.product.json'),
    plugin:path.join(root,'plugin.json'),
    mcp:path.join(root,'mcp.json'),
    evidence:path.join(root,'agentsam.quality.json'),
  };
  for(const [kind,filename] of Object.entries(files)){
    if(kind==='evidence') continue;
    if(!fs.existsSync(filename)) findings.push(finding('error','missing_'+kind,kind+' manifest missing: '+path.basename(filename)));
  }
  if(findings.some(x=>x.severity==='error')){
    return {ok:false,root,files,product:null,plugin:null,mcp:null,evidence:null,findings,status:'NOT_READY'};
  }

  let product,plugin,mcp,evidence=null;
  try{ product=readJson(files.product); }catch(error){ findings.push(finding('error','invalid_product_json',String(error.message))); }
  try{ plugin=readJson(files.plugin); }catch(error){ findings.push(finding('error','invalid_plugin_json',String(error.message))); }
  try{ mcp=readJson(files.mcp); }catch(error){ findings.push(finding('error','invalid_mcp_json',String(error.message))); }
  if(exists(root,'agentsam.quality.json')){
    try{ evidence=readJson(files.evidence); }catch(error){ findings.push(finding('error','invalid_quality_json',String(error.message))); }
  }
  if(!product||!plugin||!mcp) return {ok:false,root,files,product,plugin,mcp,evidence,findings,status:'NOT_READY'};

  if(product.schema!==PLUGIN_PRODUCT_SCHEMA) findings.push(finding('error','product_schema','agentsam.product.json must use '+PLUGIN_PRODUCT_SCHEMA));
  const id=product.identity?.id;
  const version=product.identity?.version;
  if(!id||!version||!product.identity?.publisher) findings.push(finding('error','identity_incomplete','identity.id, identity.version and identity.publisher are required'));
  if(plugin.name!==id) findings.push(finding('error','identity_name_mismatch','plugin.json name must match product identity.id'));
  if(plugin.version!==version) findings.push(finding('error','identity_version_mismatch','plugin.json version must match product identity.version'));

  const states=product.lifecycle?.states;
  if(JSON.stringify(states)!==JSON.stringify(PLUGIN_LIFECYCLE)){
    findings.push(finding('error','lifecycle_drift','lifecycle states must be: '+PLUGIN_LIFECYCLE.join(' -> ')));
  }

  const owns=Array.isArray(product.ownership?.owns)?product.ownership.owns:[];
  for(const owner of owns){
    if(FORBIDDEN_DOMAIN_OWNS.has(String(owner).toLowerCase())){
      findings.push(finding('error','platform_authority_collision','domain package claims platform authority: '+owner));
    }
  }
  const authorities=new Set(product.ownership?.platformAuthorities||[]);
  for(const authority of PLATFORM_AUTHORITIES){
    if(!authorities.has(authority)) findings.push(finding('warn','platform_authority_undeclared','shared authority not declared: '+authority));
  }

  const declaredPermissions=new Set(product.permissions?.declared||[]);
  const capabilityIds=new Set();
  for(const capability of product.capabilities||[]){
    if(!capability?.id){ findings.push(finding('error','capability_id_missing','capability missing id')); continue; }
    if(capabilityIds.has(capability.id)) findings.push(finding('error','capability_duplicate','duplicate capability: '+capability.id));
    capabilityIds.add(capability.id);
    if(!['read','write','destructive'].includes(capability.risk)) findings.push(finding('error','capability_risk_invalid','invalid risk for '+capability.id));
    for(const permission of capability.permissions||[]){
      if(!declaredPermissions.has(permission)) findings.push(finding('error','permission_undeclared',capability.id+' requires undeclared permission '+permission));
    }
  }
  if(!capabilityIds.size) findings.push(finding('error','capabilities_missing','at least one capability is required'));

  const servers=Object.values(mcp.mcpServers||{});
  if(!servers.length) findings.push(finding('error','mcp_server_missing','mcp.json must expose at least one server'));
  for(const server of servers){
    try{
      const url=new URL(server.url);
      if(url.protocol!=='https:') throw new Error('not_https');
    }catch{
      findings.push(finding('error','mcp_url_invalid','MCP server URL must be HTTPS'));
    }
  }

  if(product.auth?.connectionRequired && product.auth?.type==='none'){
    findings.push(finding('error','auth_contract_invalid','connectionRequired cannot be true when auth.type is none'));
  }
  if(product.health?.required && !product.health?.strategy){
    findings.push(finding('error','health_strategy_missing','required health checks need a strategy'));
  }
  if(product.release?.receiptRequired!==true){
    findings.push(finding('error','receipt_not_required','release.receiptRequired must be true'));
  }

  if(evidence && evidence.schema!==PLUGIN_QUALITY_EVIDENCE_SCHEMA){
    findings.push(finding('error','quality_schema','agentsam.quality.json must use '+PLUGIN_QUALITY_EVIDENCE_SCHEMA));
  }
  if(evidence?.pluginId && evidence.pluginId!==id){
    findings.push(finding('error','quality_plugin_mismatch','quality evidence pluginId must match product identity.id'));
  }

  const ok=!findings.some(x=>x.severity==='error');
  return {ok,root,files,product,plugin,mcp,evidence,findings,status:ok?'INSPECTED':'NOT_READY'};
}

export function verifyPluginProduct(target){
  const inspected=inspectPluginProduct(target);
  if(!inspected.product) return {...inspected,checks:{},ready:false,status:'NOT_READY'};
  const checks=requiredCheckMap(inspected.product,inspected.evidence);
  const checkEntries=Object.entries(checks);
  for(const [id,check] of checkEntries){
    if(!['pass','fail','unverified','not_applicable'].includes(check?.status)){
      inspected.findings.push(finding('error','quality_status_invalid','invalid quality status for '+id));
    }
  }
  const allPassed=checkEntries.length>0 && checkEntries.every(([,check])=>check?.status==='pass'||check?.status==='not_applicable');
  const ready=inspected.ok && allPassed && !inspected.findings.some(x=>x.severity==='error');
  return {...inspected,checks,ready,status:ready?'READY':'NOT_READY'};
}

export function buildPluginQualityReceipt(target,{generatedAt=new Date().toISOString()}={}){
  const verified=verifyPluginProduct(target);
  return {
    schema:PLUGIN_QUALITY_RECEIPT_SCHEMA,
    plugin:{
      id:verified.product?.identity?.id||path.basename(path.resolve(target)),
      version:verified.product?.identity?.version||null,
    },
    generatedAt,
    findings:verified.findings,
    checks:verified.checks,
    status:verified.ready?'READY':'NOT_READY',
  };
}
