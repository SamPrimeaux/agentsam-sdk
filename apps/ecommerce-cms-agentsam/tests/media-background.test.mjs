import test from 'node:test';
import assert from 'node:assert/strict';
import { removeMediaBackground } from '../backend/admin/media-background.js';
import { configureAssetStorage } from '../backend/assets/config.js';

configureAssetStorage({ workerMediaBaseUrl: 'https://example.test/media' });
const request = new Request('https://example.test/api/admin/media/21/remove-background', {method:'POST'});
function png({alpha=true}={}) {
  const bytes = new Uint8Array(41);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const view=new DataView(bytes.buffer);
  view.setUint32(16, 20);
  view.setUint32(20, 20);
  bytes[24]=8; bytes[25]=alpha?6:2; // RGBA vs opaque RGB
  return bytes.buffer;
}
function fixtures({ provider=true, alpha=true, throws=false }={}) {
  let deletes=[],puts=[];
  const original={ id:21,filename:'source.jpg',r2_key:'originals/source.jpg',content_type:'image/jpeg',folder:'images',category:null,display_order:1 };
  const db={
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first(){
              if(sql.includes('WHERE id = ?') && sql.includes('FROM media_assets')) return args[0]===21?original:{id:22,filename:'source-cutout.png',folder:'images'};
              if(sql.includes('WHERE r2_key')) return {id:22,filename:'source-cutout.png',folder:'images'};
              throw Error('Unexpected SQL first: '+sql);
            },
            async run() {
              if(!sql.includes('INSERT INTO media_assets')) throw Error('Unexpected write: '+sql);
              return {meta:{last_row_id:22}};
            },
          };
        },
      };
    },
  };
  const images=provider?{input(){
    return {transform(o){
      assert.equal(o.segment,'foreground');
      return { output: async({format})=>{
        assert.equal(format,'image/png');
        if(throws) throw Error('Provider failed');
        return {response:()=>new Response(png({alpha}))};
      }};
    }};
  }}:undefined;
  const env={DB:db,IMAGES:images,WEBSITE_ASSETS:{
    get:async(key)=>key==='originals/source.jpg'?{size:100, arrayBuffer:async()=>new ArrayBuffer(100)}:null,
    put:async(key,bytes)=>puts.push({key,bytes}),
    delete:async(key)=>deletes.push(key),
  }};
  return {env,puts,deletes};
}
test('background removal is honestly unavailable without a connected provider',async()=>{
  const f=fixtures({provider:false});
  const res=await removeMediaBackground(request,f.env,21,{id:'user'});
  assert.equal(res.status,503);
  assert.equal(f.puts.length,0);
});
test('foreground cutout preserves original and writes a separate version',async()=>{
  const f=fixtures();
  const res=await removeMediaBackground(request,f.env,21,{id:'user'});
  assert.equal(res.status,201);
  const body=await res.json();
  assert.equal(body.ok,true);
  assert.equal(body.source_preserved,true);
  assert.match(body.asset.r2_key,/^derivatives\/background-remove\/21\/.*\.png$/);
  assert.equal(body.asset.meta.media_edit.source_media_asset_id,21);
  assert.equal(f.puts.length,1);
  assert.deepEqual(f.deletes,[]);
});
test('a provider output with no alpha-capable image must not persist',async()=>{
  const f=fixtures({alpha:false});
  const res=await removeMediaBackground(request,f.env,21,{id:'user'});
  assert.equal(res.status,502);
  assert.equal(f.puts.length,0);
});
test('provider failure leaves the original untouched',async()=>{
  const f=fixtures({throws:true});
  const res=await removeMediaBackground(request,f.env,21,{id:'user'});
  assert.equal(res.status,502);
  assert.equal(f.puts.length,0);
  assert.deepEqual(f.deletes,[]);
});
test('identity is mandatory for media mutations',async()=>{
  const f=fixtures();
  const res=await removeMediaBackground(request,f.env,21,null);
  assert.equal(res.status,401);
});
