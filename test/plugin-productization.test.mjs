import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPluginQualityReceipt, inspectPluginProduct, verifyPluginProduct } from '../src/plugins/productization.js';

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
    capabilities:[{id:'test.read',risk:'read',permissions:['test.read']}],
    permissions:{declared:['test.read']},
    auth:{type:'oauth',connectionRequired:true,resource:'https://plugins.example.com/mcp'},
    health:{required:true,strategy:'mcp.tools_list'},
    lifecycle:{states:['available','installed','needs_connection','connected','ready']},
    verification:{requiredChecks:['manifest','tool_call','fresh_account']},
    release:{receiptRequired:true},
  }));
  if(quality) fs.writeFileSync(path.join(root,'agentsam.quality.json'),JSON.stringify({
    schema:'agentsam.plugin-quality-evidence/v1',pluginId:'agentsam-test',
    checks:{manifest:{status:'pass',evidence:'fixture'},tool_call:{status:'pass',evidence:'fixture'},fresh_account:{status:'pass',evidence:'fixture'}},
  }));
  return root;
}

test('inspect enforces shared authority ownership',()=>{
  const root=fixture({collision:true});
  const result=inspectPluginProduct(root);
  assert.equal(result.ok,false);
  assert(result.findings.some(row=>row.code==='platform_authority_collision'));
});

test('verify computes READY only from required evidence',()=>{
  const ready=verifyPluginProduct(fixture());
  assert.equal(ready.status,'READY');
  const missing=verifyPluginProduct(fixture({quality:false}));
  assert.equal(missing.status,'NOT_READY');
  assert.equal(missing.checks.fresh_account.status,'unverified');
});

test('receipt is deterministic aside from generated timestamp',()=>{
  const receipt=buildPluginQualityReceipt(fixture(),{generatedAt:'2026-10-08T00:00:00.000Z'});
  assert.equal(receipt.schema,'agentsam.plugin-quality-receipt/v1');
  assert.equal(receipt.plugin.id,'agentsam-test');
  assert.equal(receipt.status,'READY');
  assert.equal(receipt.generatedAt,'2026-10-08T00:00:00.000Z');
});
