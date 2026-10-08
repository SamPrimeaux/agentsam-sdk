import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBasinResources} from '../src/families/basin.js';

test('Basin is absent without connected Cloudflare account',async()=>{
 const x=await discoverBasinResources(null);
 assert.equal(x.enabled,false);
 assert.equal(x.warehouses.length,0);
});
test('Basin discovery reads actual authorized catalog and pipeline API results only',async()=>{
 const paths=[];
 const client={accountId:'account-01',async request(_method,path){
   paths.push(path);
   if(path.endsWith('/basin-catalog'))return {result:{warehouses:[{id:'warehouse-1',name:'analytics',status:'active'}]}};
   return {result:[{id:'pipeline-1',name:'events-to-iceberg',status:'running'}]};
 }};
 const data=await discoverBasinResources(client);
 assert.equal(data.status,'connected');
 assert.deepEqual(data.warehouses.map(x=>x.id),['warehouse-1']);
 assert.deepEqual(data.pipelines.map(x=>x.id),['pipeline-1']);
 assert.deepEqual(data.catalogTables,[]);
 assert.ok(paths.every(x=>x.startsWith('/accounts/account-01/')));
});
test('Basin never invents authorized resources when all discovery fails',async()=>{
 const err=()=>Promise.reject(Object.assign(new Error('unauthorized'),{code:'permission_denied'}));
 const data=await discoverBasinResources({accountId:'account',request:err});
 assert.equal(data.status,'permission_required');
 assert.equal(data.warehouses.length,0);
 assert.equal(data.pipelines.length,0);
});
