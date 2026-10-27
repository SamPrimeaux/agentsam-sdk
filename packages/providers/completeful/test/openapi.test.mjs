import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { COMPLETEFUL_CONTRACT,COMPLETEFUL_OPERATIONS,createCompletefulClient } from '../src/index.js';

const specBytes=readFileSync(new URL('../openapi/openapi.json',import.meta.url));
const spec=JSON.parse(specBytes);
const entries=Object.entries(COMPLETEFUL_OPERATIONS);
test('OpenAPI is exact authority for all callable provider operations',()=>{
  assert.equal(COMPLETEFUL_CONTRACT.sha256,createHash('sha256').update(specBytes).digest('hex'));
  const paths=Object.entries(spec.paths).flatMap(([path,methods])=>Object.keys(methods)
    .filter(method=>['get','post','patch','put','delete'].includes(method))
    .map(method=>method.toUpperCase()+' '+path));
  assert.equal(paths.length,55);
  assert.deepEqual(new Set(entries.map(([,v])=>v.method+' '+v.path)),new Set(paths));
});
test('55 SDK methods dispatch against injected fetch with no host-specific env',async()=>{
  const calls=[];
  const client=createCompletefulClient({apiKey:'capp_test_abc',fetchImpl:async(url,opts)=>{
    calls.push({url:String(url),opts});
    return Response.json({okay:true},{headers:{'x-capp-dry-run':'true'}});
  }});
  for(const [name,op] of entries){
    const path=Object.fromEntries(op.pathParams.map((key)=>[key,'example-id']));
    const query=Object.fromEntries(op.requiredQuery.map(key=>[key,'example']));
    const body=op.bodyRequired?Object.fromEntries(op.requiredBodyFields.map(key=>[key,'example'])):undefined;
    const response=await client.call(name,{path,query,body});
    assert.equal(response.meta.dry_run,true);
    const request=calls.at(-1);
    assert.equal(request.opts.method,op.method);
    assert.equal(request.opts.headers.get('Authorization'),'Bearer capp_test_abc');
    assert.equal(new URL(request.url).pathname,'/v1'+op.path.replace(/\{\w+\}/g,'example-id'));
  }
  assert.equal(calls.length,55);
});
test('strict path guards and live write gates are enforced in the portable client',async()=>{
  const client=createCompletefulClient({apiKey:'capp_live_mock',allowLiveWrites:false,
    fetchImpl:async()=>Response.json({})});
  await assert.rejects(()=>client.call('mockups.render',{body:{mockup_id:'abc',art_url:'https://example.test/art.png'}}),
    {code:'completeful_live_writes_disabled'});
  await assert.rejects(()=>client.call('catalog.mockups',{path:{productId:'..'}}),
    {code:'completeful_invalid_operation_input'});
  await assert.rejects(()=>client.call('catalog.products',{query:{limit:100000}}),
    {code:'completeful_invalid_operation_input'});
  await assert.rejects(()=>client.call('mockups.render',{body:{mockup_id:'abc'}}),
    {code:'completeful_invalid_operation_input'});
});
test('independent installations cannot leak shop credentials across provider clients',async()=>{
  const calls=[];
  const fakeFetch=async(url,opts)=>{
    calls.push({path:new URL(url).pathname,auth:opts.headers.get('Authorization')});
    return Response.json({shops:[]});
  };
  const a=createCompletefulClient({apiKey:'capp_test_siteA',fetchImpl:fakeFetch});
  const b=createCompletefulClient({apiKey:'capp_test_siteB',fetchImpl:fakeFetch});
  await Promise.all([a.api.shops.list(),b.api.shops.list()]);
  assert.deepEqual(calls.map(v=>v.auth),['Bearer capp_test_siteA','Bearer capp_test_siteB']);
  assert.deepEqual(calls.map(v=>v.path),['/v1/shops','/v1/shops']);
  assert.notStrictEqual(a,b);
});

test('low-level HTTP transport also rejects unauthorized supplier writes',async()=>{
  const client=createCompletefulClient({apiKey:'capp_live_mock',allowLiveWrites:false,
    fetchImpl:async()=>Response.json({})});
  await assert.rejects(()=>client.request('POST','/shops/example/orders',{body:{}}),
    {code:'completeful_live_writes_disabled'});
  await assert.rejects(()=>client.request('POST','/mockups/renders',{body:{}}),
    {code:'completeful_live_writes_disabled'});
});
