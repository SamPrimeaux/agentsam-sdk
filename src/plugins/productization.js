import fs from 'node:fs';
import path from 'node:path';

export const PLUGIN_PRODUCT_SCHEMA = 'agentsam.plugin-product/v1';
export const PLUGIN_EVIDENCE_BUNDLE_SCHEMA = 'agentsam.plugin-evidence-bundle/v1';
export const PLUGIN_QUALITY_EVIDENCE_SCHEMA = 'agentsam.plugin-quality-evidence/v1';
export const PLUGIN_QUALITY_RECEIPT_SCHEMA = 'agentsam.plugin-quality-receipt/v1';
export const PLUGIN_LIFECYCLE = Object.freeze(['available','installed','needs_connection','connected','ready']);

/**
 * Protocol gates, not product-specific presets. A new OAuth-backed plugin must
 * prove issuer acceptance and alignment with the MCP resource/tool definitions.
 * These are observations supplied by the issuer/host/runtime evidence producers;
 * plugin inspection does not perform network discovery or authorize clients.
 */
export const PLUGIN_OAUTH_RUNTIME_GATES = Object.freeze([
  'authorization.resource_registered',
  'authorization.resource_metadata',
  'authorization.scope_parity',
  'authorization.client_registration',
  'authorization.token_audience',
  'runtime.security_schemes',
  'release.cross_service_compatibility',
]);
const nonWaivableOAuthGates = new Set(PLUGIN_OAUTH_RUNTIME_GATES);
function isRuntimeOnlyCheck(id) {
  return id === 'installation.account'
    || /^(?:authorization|runtime|health|product|persistence|security|portability|release)\./.test(id);
}
function requiredCheckIds(product) {
  const declared = product?.verification?.requiredChecks || [];
  return [...new Set([
    ...declared,
    ...(product?.auth?.type === 'oauth' ? PLUGIN_OAUTH_RUNTIME_GATES : []),
  ])];
}

const PLATFORM_AUTHORITIES = Object.freeze([
  'identity.oauth',
  'vault.credentials',
  'settings.plugin-installation',
  'plugin-runtime.mcp',
  'hooks.mcp-adaptation',
  'capability.runtime',
  'repository.evidence',
  'machine.perception',
  'plugin-runtime.health',
  'plugin-runtime.receipts',
  'plugin-runtime.retry',
]);

const MISPLACED_AUTHORITY_HINTS = Object.freeze({
  oauth: 'identity.oauth',
  oauth_engine: 'identity.oauth',
  credentials: 'vault.credentials',
  credential_vault: 'vault.credentials',
  plugin_installer: 'settings.plugin-installation',
  mcp_runtime: 'plugin-runtime.mcp',
  settings_framework: 'settings.plugin-installation',
  generic_health: 'plugin-runtime.health',
  generic_receipts: 'plugin-runtime.receipts',
  generic_retry: 'plugin-runtime.retry',
});

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename,'utf8'));
}
function finding(severity,code,message,evidenceSource,expectedOwner=null){
  return {severity,code,message,evidenceSource,expectedOwner};
}
function exists(root,name){ return fs.existsSync(path.join(root,name)); }

export function readPluginEvidenceBundle(filename){
  if(!filename) return null;
  const bundle=readJson(path.resolve(filename));
  if(bundle?.schema!==PLUGIN_EVIDENCE_BUNDLE_SCHEMA){
    throw new TypeError('expected '+PLUGIN_EVIDENCE_BUNDLE_SCHEMA);
  }
  return bundle;
}

function evidenceChecks(product,staticEvidence,bundle){
  const checks={};
  const runtime=[...(bundle?.capabilityReceipts||[]),...(bundle?.runtimeReceipts||[])];
  const runtimeById=new Map(runtime.map(row=>[row.check_id||row.checkId||row.tool,row]));
  for(const id of requiredCheckIds(product)){
    const dynamic=runtimeById.get(id);
    if(dynamic){
      const status=dynamic.status==='passed'?'pass':dynamic.status==='failed'?'fail':dynamic.status;
      const validStatus = ['pass','fail','unverified','not_applicable'].includes(status);
      const nonWaivable = nonWaivableOAuthGates.has(id);
      const hasReceipt = Boolean(dynamic.receipt_ref || dynamic.receipt);
      checks[id]={
        status:!validStatus || (nonWaivable && (status === 'not_applicable' || (status === 'pass' && !hasReceipt)))
          ? 'unverified' : status,
        evidence:dynamic.evidence||dynamic.receipt_ref||dynamic.receipt||'runtime receipt',
        receipt:dynamic.receipt_ref||dynamic.receipt||null,
        source:'runtime_receipt',
      };
      continue;
    }
    const local=staticEvidence?.checks?.[id];
    // A package author cannot attest their own OAuth/production runtime success.
    // Keep package claims visible for diagnostics but do not promote them to proof.
    if (isRuntimeOnlyCheck(id)) {
      checks[id]={
        status:'unverified',
        source:local?'package_evidence_not_runtime_proof':'missing_runtime_evidence',
        ...(local?.evidence ? {evidence:local.evidence} : {}),
      };
    } else {
      checks[id]=local?{...local,source:'package_quality_evidence'}:{status:'unverified',source:'missing_evidence'};
    }
  }
  return checks;
}

function checkPassed(checks,id){
  return checks?.[id]?.status === 'pass' || checks?.[id]?.status === 'not_applicable';
}

export function resolvePluginLifecycle(product,checks,{ready=false}={}){
  const available=checkPassed(checks,'definition.manifest');
  const installed=checkPassed(checks,'installation.account');
  const connectionRequired=Boolean(product?.auth?.connectionRequired);
  const connected=!connectionRequired || (
    checkPassed(checks,'authorization.valid') &&
    checkPassed(checks,'authorization.permissions')
  );
  let state=null;
  if(available) state='available';
  if(installed) state=connectionRequired && !connected ? 'needs_connection' : 'connected';
  if(ready) state='ready';
  const blockedBy=Object.entries(checks||{})
    .filter(([,check])=>check?.status==='fail'||check?.status==='unverified')
    .map(([id])=>id);
  return {state,available,installed,connectionRequired,connected,ready,blockedBy};
}

function repositoryFindings(bundle,product){
  const mine=bundle?.refinery;
  if(!mine) return [];
  if(mine.schema!=='agentsam.refinery.proposal.v1'){
    return [finding('error','refinery_schema','repository refinery evidence has an unsupported schema','repository.mine',null)];
  }
  const domainPackage=product?.ownership?.domainPackage;
  const out=[];
  for(const candidate of mine.candidates||[]){
    const involvesDomain=(candidate.implementations||[]).some(row=>row.declared_package===domainPackage);
    if(!involvesDomain) continue;
    const owner=candidate.likely_owner?.package||null;
    const source='repository.mine:'+candidate.candidate_id;
    if(owner && owner!==domainPackage){
      out.push(finding(
        'warn',
        'reuse_candidate',
        `repository.mine found ${candidate.match?.type||'overlap'} with an existing likely owner`,
        source,
        owner,
      ));
    }else{
      out.push(finding(
        'info',
        'repository_overlap_review',
        `repository.mine found ${candidate.match?.type||'overlap'} requiring ownership review`,
        source,
        owner,
      ));
    }
  }
  return out;
}

export function inspectPluginProduct(target,{evidenceBundle=null}={}){
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
    if(!fs.existsSync(filename)){
      findings.push(finding('error','missing_'+kind,kind+' manifest missing: '+path.basename(filename),'plugin.definition',null));
    }
  }
  if(findings.some(row=>row.severity==='error')){
    return {ok:false,root,files,product:null,plugin:null,mcp:null,evidence:null,evidenceBundle,findings,status:'NOT_READY'};
  }

  let product,plugin,mcp,evidence=null;
  try{ product=readJson(files.product); }catch(error){ findings.push(finding('error','invalid_product_json',String(error.message),'agentsam.product.json',null)); }
  try{ plugin=readJson(files.plugin); }catch(error){ findings.push(finding('error','invalid_plugin_json',String(error.message),'plugin.json',null)); }
  try{ mcp=readJson(files.mcp); }catch(error){ findings.push(finding('error','invalid_mcp_json',String(error.message),'mcp.json',null)); }
  if(exists(root,'agentsam.quality.json')){
    try{ evidence=readJson(files.evidence); }catch(error){ findings.push(finding('error','invalid_quality_json',String(error.message),'agentsam.quality.json',null)); }
  }
  if(!product||!plugin||!mcp){
    return {ok:false,root,files,product,plugin,mcp,evidence,evidenceBundle,findings,status:'NOT_READY'};
  }

  if(product.schema!==PLUGIN_PRODUCT_SCHEMA){
    findings.push(finding('error','product_schema','agentsam.product.json must use '+PLUGIN_PRODUCT_SCHEMA,'agentsam.product.json',null));
  }
  const id=product.identity?.id;
  const version=product.identity?.version;
  if(!id||!version||!product.identity?.publisher){
    findings.push(finding('error','identity_incomplete','identity.id, identity.version and identity.publisher are required','agentsam.product.json',null));
  }
  if(plugin.name!==id){
    findings.push(finding('error','identity_name_mismatch','plugin.json name must match product identity.id','plugin.json','agentsam.product.json:identity'));
  }
  if(plugin.version!==version){
    findings.push(finding('error','identity_version_mismatch','plugin.json version must match product identity.version','plugin.json','agentsam.product.json:identity'));
  }

  const states=product.lifecycle?.states;
  if(JSON.stringify(states)!==JSON.stringify(PLUGIN_LIFECYCLE)){
    findings.push(finding('error','lifecycle_drift','lifecycle states must be: '+PLUGIN_LIFECYCLE.join(' -> '),'agentsam.product.json','agentsam.plugin-product/v1'));
  }

  for(const owner of Array.isArray(product.ownership?.owns)?product.ownership.owns:[]){
    const expected=MISPLACED_AUTHORITY_HINTS[String(owner).toLowerCase()];
    if(expected){
      findings.push(finding('error','platform_authority_collision','domain package claims shared platform authority: '+owner,'agentsam.product.json:ownership',expected));
    }
  }
  if (product.auth?.type === 'oauth') {
    const declaredChecks = new Set(product.verification?.requiredChecks || []);
    const missing = PLUGIN_OAUTH_RUNTIME_GATES.filter(id => !declaredChecks.has(id));
    if (missing.length) findings.push(finding(
      'warn','oauth_runtime_gates_implicit',
      'OAuth product omits mandatory runtime checks: '+missing.join(', ')+'. These remain REQUIRED for READY.',
      'agentsam.product.json:verification','identity.oauth',
    ));
  }

  const authorities=new Set(product.ownership?.platformAuthorities||[]);
  for(const authority of PLATFORM_AUTHORITIES){
    if(!authorities.has(authority)){
      findings.push(finding('warn','platform_authority_undeclared','shared authority not declared: '+authority,'agentsam.product.json:ownership',authority));
    }
  }

  const declaredPermissions=new Set(product.permissions?.declared||[]);
  const capabilityIds=new Set();
  for(const capability of product.capabilities||[]){
    if(!capability?.id){
      findings.push(finding('error','capability_id_missing','capability missing id','agentsam.product.json:capabilities','protocol/capabilities'));
      continue;
    }
    if(capabilityIds.has(capability.id)){
      findings.push(finding('error','capability_duplicate','duplicate capability: '+capability.id,'agentsam.product.json:capabilities','protocol/capabilities'));
    }
    capabilityIds.add(capability.id);
    if(!['read','prepare','write','destructive'].includes(capability.risk)){
      findings.push(finding('error','capability_risk_invalid','invalid risk for '+capability.id,'agentsam.product.json:capabilities','protocol/capabilities'));
    }
    for(const permission of capability.permissions||[]){
      if(!declaredPermissions.has(permission)){
        findings.push(finding('error','permission_undeclared',capability.id+' requires undeclared permission '+permission,'agentsam.product.json:capabilities','agentsam.product.json:permissions'));
      }
    }
  }
  if(!capabilityIds.size){
    findings.push(finding('error','capabilities_missing','at least one capability is required','agentsam.product.json:capabilities','protocol/capabilities'));
  }

  const servers=Object.values(mcp.mcpServers||{});
  if(!servers.length){
    findings.push(finding('error','mcp_server_missing','mcp.json must expose at least one server','mcp.json','plugin-runtime.mcp'));
  }
  for(const server of servers){
    try{
      const url=new URL(server.url);
      if(url.protocol!=='https:') throw new Error('not_https');
    }catch{
      findings.push(finding('error','mcp_url_invalid','MCP server URL must be HTTPS','mcp.json','plugin-runtime.mcp'));
    }
  }

  if(product.auth?.connectionRequired && product.auth?.type==='none'){
    findings.push(finding('error','auth_contract_invalid','connectionRequired cannot be true when auth.type is none','agentsam.product.json:auth','identity.oauth'));
  }
  if(product.health?.required && !product.health?.strategy){
    findings.push(finding('error','health_strategy_missing','required health checks need a strategy','agentsam.product.json:health','plugin-runtime.health'));
  }
  if(product.release?.receiptRequired!==true){
    findings.push(finding('error','receipt_not_required','release.receiptRequired must be true','agentsam.product.json:release','plugin-runtime.receipts'));
  }

  if(evidence && evidence.schema!==PLUGIN_QUALITY_EVIDENCE_SCHEMA){
    findings.push(finding('error','quality_schema','agentsam.quality.json must use '+PLUGIN_QUALITY_EVIDENCE_SCHEMA,'agentsam.quality.json','plugin-runtime.receipts'));
  }
  if(evidence?.pluginId && evidence.pluginId!==id){
    findings.push(finding('error','quality_plugin_mismatch','quality evidence pluginId must match product identity.id','agentsam.quality.json','agentsam.product.json:identity'));
  }

  if(evidenceBundle){
    if(evidenceBundle.schema!==PLUGIN_EVIDENCE_BUNDLE_SCHEMA){
      findings.push(finding('error','evidence_bundle_schema','unsupported plugin evidence bundle schema','plugin.evidence.bundle',null));
    }else{
      if(evidenceBundle.machine && evidenceBundle.machine.schema!=='agentsam.machine.receipt.v1'){
        findings.push(finding('error','machine_evidence_schema','Machine evidence must be a canonical machine receipt','machine.inspect','AgentSam Machine'));
      }
      if(evidenceBundle.repository && evidenceBundle.repository.schema!=='agentsam.repository.crawl.v1'){
        findings.push(finding('error','repository_evidence_schema','Repository evidence must be a canonical crawl graph','repository.crawl','@inneranimalmedia/agentsam-repository'));
      }
      findings.push(...repositoryFindings(evidenceBundle,product));
    }
  }

  const ok=!findings.some(row=>row.severity==='error');
  return {ok,root,files,product,plugin,mcp,evidence,evidenceBundle,findings,status:ok?'INSPECTED':'NOT_READY'};
}

export function verifyPluginProduct(target,{evidenceBundle=null}={}){
  const inspected=inspectPluginProduct(target,{evidenceBundle});
  if(!inspected.product) return {...inspected,checks:{},ready:false,status:'NOT_READY'};
  const checks=evidenceChecks(inspected.product,inspected.evidence,evidenceBundle);
  for(const [id,check] of Object.entries(checks)){
    if(!['pass','fail','unverified','not_applicable'].includes(check?.status)){
      inspected.findings.push(finding('error','quality_status_invalid','invalid quality status for '+id,check?.source||'verification.evidence','plugin-runtime.receipts'));
    }
  }
  const allPassed=Object.keys(checks).length>0 && Object.values(checks).every(check=>check?.status==='pass'||check?.status==='not_applicable');
  const ready=inspected.ok && allPassed && !inspected.findings.some(row=>row.severity==='error');
  const lifecycle=resolvePluginLifecycle(inspected.product,checks,{ready});
  return {...inspected,checks,lifecycle,ready,status:ready?'READY':'NOT_READY'};
}

export function buildPluginQualityReceipt(target,{generatedAt=new Date().toISOString(),verification=null,evidenceBundle=null}={}){
  const verified=verification||verifyPluginProduct(target,{evidenceBundle});
  return {
    schema:PLUGIN_QUALITY_RECEIPT_SCHEMA,
    plugin:{
      id:verified.product?.identity?.id||path.basename(path.resolve(target)),
      version:verified.product?.identity?.version||null,
    },
    generatedAt,
    findings:verified.findings,
    checks:verified.checks,
    lifecycle:verified.lifecycle||resolvePluginLifecycle(verified.product,verified.checks,{ready:Boolean(verified.ready)}),
    status:verified.ready?'READY':'NOT_READY',
  };
}
