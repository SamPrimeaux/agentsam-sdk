import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildPluginQualityReceipt,
  inspectPluginProduct,
  verifyPluginProduct,
} from '../../src/plugins/productization.js';

function fixture({collision=false,quality=true}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-plugin-product-'));
  fs.writeFileSync(path.join(root,'plugin.json'),JSON.stringify({name:'agentsam-test',version:'1.0.0'}));
  fs.writeFileSync(path.join(root,'mcp.json'),JSON.stringify({mcpServers:{test:{type:'streamable-http',url:'https://plugins.example.com/mcp/test'}}}));
  fs.writeFileSync(path.join(root,'agentsam.product.json'),JSON.stringify({
    schema:'agentsam.plugin-product/v1',
    identity:{id:'agentsam-test',version:'1.0.0',publisher:'AgentSam'},
    ownership:{
      domainPackage:'@inneranimalmedia/agentsam-test',
      owns:collision?['domain_logic','oauth_engine']:['domain_logic'],
      platformAuthorities:['identity.oauth','vault.credentials','settings.plugin-installation','plugin-runtime.mcp','plugin-runtime.health','plugin-runtime.receipts','plugin-runtime.retry'],
    },
    resources:['test.context'],
    capabilities:[{id:'test.read',risk:'read',permissions:['test.read']}],
    permissions:{declared:['test.read']},
    auth:{type:'oauth',connectionRequired:true,resource:'https://plugins.example.com/mcp'},
    health:{required:true,strategy:'mcp.tools_list'},
    lifecycle:{states:['available','installed','needs_connection','connected','ready']},
    verification:{requiredChecks:['definition.manifest','installation.account','authorization.valid','authorization.permissions','runtime.tools_executable','portability.fresh_account']},
    release:{receiptRequired:true},
  }));
  if(quality) fs.writeFileSync(path.join(root,'agentsam.quality.json'),JSON.stringify({
    schema:'agentsam.plugin-quality-evidence/v1',pluginId:'agentsam-test',
    checks:{
      'definition.manifest':{status:'pass',evidence:'fixture manifest',receipt:'receipt:manifest'},
      'installation.account':{status:'pass',evidence:'fixture install',receipt:'receipt:install'},
      'authorization.valid':{status:'pass',evidence:'fixture auth',receipt:'receipt:auth'},
      'authorization.permissions':{status:'pass',evidence:'fixture scopes',receipt:'receipt:scopes'},
      'runtime.tools_executable':{status:'pass',evidence:'fixture tool call',receipt:'receipt:tool_call'},
      'portability.fresh_account':{status:'pass',evidence:'fixture fresh account',receipt:'receipt:fresh_account'},
    },
  }));
  return root;
}

test('inspect enforces shared authority ownership and identifies canonical authority',()=>{
  const root=fixture({collision:true});
  const result=inspectPluginProduct(root);
  assert.equal(result.ok,false);
  const row=result.findings.find(item=>item.code==='platform_authority_collision');
  assert.equal(row.evidenceSource,'agentsam.product.json:ownership');
  assert.equal(row.expectedOwner,'identity.oauth');
});

test('inspect consumes repository.mine evidence without running another scanner',()=>{
  const root=fixture();
  const evidenceBundle={
    schema:'agentsam.plugin-evidence-bundle/v1',
    machine:{schema:'agentsam.machine.receipt.v1',capability:'machine.inspect'},
    repository:{schema:'agentsam.repository.crawl.v1'},
    refinery:{
      schema:'agentsam.refinery.proposal.v1',
      candidates:[{
        candidate_id:'cand_identity',
        match:{type:'normalized_hash',score:.98},
        implementations:[
          {repository:'plugin-repo',path:'src/oauth-helper.js',declared_package:'@inneranimalmedia/agentsam-test'},
          {repository:'sdk',path:'packages/agentsam-identity/oauth.js',declared_package:'@inneranimalmedia/agentsam-identity'},
        ],
        likely_owner:{package:'@inneranimalmedia/agentsam-identity',confidence:'manifest'},
      }],
    },
  };
  const result=inspectPluginProduct(root,{evidenceBundle});
  const row=result.findings.find(item=>item.code==='reuse_candidate');
  assert.equal(row.evidenceSource,'repository.mine:cand_identity');
  assert.equal(row.expectedOwner,'@inneranimalmedia/agentsam-identity');
});

test('verify computes READY only from required evidence',()=>{
  const ready=verifyPluginProduct(fixture());
  assert.equal(ready.status,'READY');
  const missing=verifyPluginProduct(fixture({quality:false}));
  assert.equal(missing.status,'NOT_READY');
  assert.equal(missing.lifecycle.state,null);
  assert.equal(missing.checks['portability.fresh_account'].status,'unverified');
});

test('runtime receipts override static placeholders without persisting ready state',()=>{
  const root=fixture({quality:false});
  const evidenceBundle={
    schema:'agentsam.plugin-evidence-bundle/v1',
    capabilityReceipts:[],
    runtimeReceipts:[
      {check_id:'definition.manifest',status:'passed',receipt_ref:'receipt:manifest'},
      {check_id:'installation.account',status:'passed',receipt_ref:'receipt:install'},
      {check_id:'authorization.valid',status:'passed',receipt_ref:'receipt:auth'},
      {check_id:'authorization.permissions',status:'passed',receipt_ref:'receipt:scopes'},
      {check_id:'runtime.tools_executable',status:'passed',receipt_ref:'receipt:tool-call'},
      {check_id:'portability.fresh_account',status:'passed',receipt_ref:'receipt:fresh-account'},
    ],
  };
  const verified=verifyPluginProduct(root,{evidenceBundle});
  assert.equal(verified.status,'READY');
  assert.equal(verified.lifecycle.state,'ready');
  assert.equal(verified.lifecycle.ready,true);
  assert.equal(verified.checks['runtime.tools_executable'].receipt,'receipt:tool-call');
  assert.equal(Object.hasOwn(verified.product,'ready'),false);
});

test('receipt renders one verification result instead of running a separate engine',()=>{
  const root=fixture();
  const verification=verifyPluginProduct(root);
  const receipt=buildPluginQualityReceipt(root,{
    generatedAt:'2026-10-08T00:00:00.000Z',
    verification,
  });
  assert.equal(receipt.schema,'agentsam.plugin-quality-receipt/v1');
  assert.equal(receipt.plugin.id,'agentsam-test');
  assert.equal(receipt.status,'READY');
  assert.equal(receipt.lifecycle.state,'ready');
  assert.equal(receipt.generatedAt,'2026-10-08T00:00:00.000Z');
  assert.deepEqual(receipt.checks,verification.checks);
});


test('lifecycle distinguishes installed from connected when authorization is missing',()=>{
  const root=fixture({quality:false});
  const evidenceBundle={
    schema:'agentsam.plugin-evidence-bundle/v1',
    runtimeReceipts:[
      {check_id:'definition.manifest',status:'passed',receipt_ref:'receipt:def'},
      {check_id:'installation.account',status:'passed',receipt_ref:'receipt:install'},
    ],
  };
  const verified=verifyPluginProduct(root,{evidenceBundle});
  assert.equal(verified.lifecycle.state,'needs_connection');
  assert.equal(verified.lifecycle.installed,true);
  assert.equal(verified.lifecycle.connected,false);
  assert.equal(verified.status,'NOT_READY');
});
