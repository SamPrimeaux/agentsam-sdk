import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudflareD1Provisioner} from '../../src/capabilities/cloudflare-d1-provision.js';

const dbId='4a39446d-a466-4fb7-8971-16e4bfb64f1c';
const accountId='a7a41ef0745c4f78a0d321beb34e5b8b';
test('customer-account Cloudflare D1 CREATE POST uses only installation resolver identity',async()=>{
  let count=0;
  const create=createCloudflareD1Provisioner({
    resolveAccountForInstallation:async auth=>{
      assert.equal(auth.installationId,'install1');
      return {installationId:'install1',accountId,apiToken:'fixture-api-token-redacted'};
    },
    fetchImpl:async(url,init)=>{
      count++;
      assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database');
      assert.equal(init.method,'POST');
      assert.equal(init.headers.Authorization,'Bearer fixture-api-token-redacted');
      assert.deepEqual(JSON.parse(init.body),{name:'customer-db'});
      return {ok:true,status:200,json:async()=>({success:true,result:{uuid:dbId,name:'customer-db'}})};
    },
  });
  const output=await create({name:'customer-db',confirm_name:'customer-db',installation:{installationId:'install1',actorId:'user1'}});
  assert.equal(output.database_id,dbId);
  assert.equal(count,1);
  assert.doesNotMatch(JSON.stringify(output),/fixture-api-token/);
});
test('provider missing, wrong install, invalid inputs and API errors fail closed',async()=>{
  let called=0;
  const create=createCloudflareD1Provisioner({
    resolveAccountForInstallation:async()=>({installationId:'wrong',accountId,apiToken:'fixture-api-token-redacted'}),
    fetchImpl:async()=>{called++;throw Error('should never call');},
  });
  await assert.rejects(create({name:'good',confirm_name:'good',installation:{installationId:'install1',actorId:'user1'}}),/d1_provider_installation_mismatch/);
  await assert.rejects(create({name:'../bad',confirm_name:'../bad',installation:{installationId:'install1',actorId:'user1'}}),/d1_name_invalid/);
  assert.equal(called,0);
  const conflict=createCloudflareD1Provisioner({
    resolveAccountForInstallation:async()=>({installationId:'install1',accountId,apiToken:'fixture-api-token-redacted'}),
    fetchImpl:async()=>({ok:false,status:409,json:async()=>({success:false,errors:[{message:'not exposed'}]})}),
  });
  await assert.rejects(conflict({name:'db1',confirm_name:'db1',installation:{installationId:'install1',actorId:'user1'}}),/d1_name_conflict/);
});
