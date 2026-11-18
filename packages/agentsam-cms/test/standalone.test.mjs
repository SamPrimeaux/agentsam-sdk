import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCmsOperations,CMS_OPERATION_CONTRACTS} from '../src/index.js';
import {createCmsMemoryRepository} from './support/memory-repository.mjs';
test('package runs with an injected host repository without SQL',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'sam-cms-packaged-'));
  let db;
  try{
    db=await createCmsMemoryRepository();
    const principal={accountId:'a',installationId:'i',actorId:'u'};
    const operations=createCmsOperations({
      defineSamOperation:x=>x,repository:db,
      resolveTrustedContext:async()=>principal,authorize:async()=>true,
    });
    assert.equal(CMS_OPERATION_CONTRACTS.length,13);
    assert.equal(operations.length,25);
    const byName=new Map(operations.map(o=>[o.id,o]));
    const created=await byName.get('cms.page.createDraft').handler({pageId:'home',title:'Home',slug:'home'},{});
    assert.equal(created.version,1);
    const preview=await byName.get('cms.page.preview').handler({pageId:'home'},{});
    assert.equal(preview.published,false);
    assert.equal(preview.digest.length,64);
    assert.equal(db.getPublication(principal,'home'),null);
  }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});
