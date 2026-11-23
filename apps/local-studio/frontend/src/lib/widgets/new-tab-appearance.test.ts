import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNewTabAppearance,saveNewTabAppearance} from './new-tab-appearance.ts';

test('New Tab appearance reads and saves through account preferences, not local storage',async()=>{
  const originalFetch=globalThis.fetch;
  const calls:{method:string;url:string;body:unknown;credentials:RequestCredentials|undefined}[]=[];
  globalThis.fetch=async(input,options)=>{
    calls.push({method:options?.method??'GET',url:String(input),body:options?.body?JSON.parse(String(options.body)):null,credentials:options?.credentials});
    return new Response(JSON.stringify({ok:true,appearance:{wallpaper:'forest',imageUrl:null}}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    assert.equal((await loadNewTabAppearance()).wallpaper,'forest');
    assert.equal((await saveNewTabAppearance({wallpaper:'forest',imageUrl:null})).wallpaper,'forest');
    assert.deepEqual(calls.map(x=>x.method),['GET','PUT']);
    assert.ok(calls.every(x=>x.url==='/api/settings/new-tab'&&x.credentials==='same-origin'));
    assert.deepEqual(calls[1].body,{wallpaper:'forest',imageUrl:null});
  }finally{globalThis.fetch=originalFetch;}
});
