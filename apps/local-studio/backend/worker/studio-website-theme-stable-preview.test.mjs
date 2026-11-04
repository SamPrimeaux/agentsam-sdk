import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStudioWebsiteThemeCatalog } from './studio-website-theme-catalog.js';

test('stable catalog preview aliases are trusted only for their exact theme',async()=>{
  const original=globalThis.fetch;
  const slug='plain-jane';
  const hash='a'.repeat(64);
  const release={status:'published',sha256:hash,
    storageKey:'releases/'+slug+'/0.1.0/'+hash+'.zip'};
  const product={slug,version:'0.1.0',name:'Plain Jane Journal',pages:['Home'],
    cardImage:'/previews/plain-jane.svg',release};
  try{
    globalThis.fetch=async()=>Response.json({ok:true,products:[{
      ...product,previewUrl:'https://themes.inneranimalmedia.com/themes/plain-jane/presets/plain-jane/demo/'
    },{
      ...product,slug:'plain-jane-evil',previewUrl:'https://themes.inneranimalmedia.com/themes/plain-jane/presets/plain-jane/demo/'
    }]});
    const result=await (await handleStudioWebsiteThemeCatalog(new Request('https://agent.test/api/admin/website-themes'),'acct')).json();
    assert.match(result.products[0].preview_url,/\/themes\/plain-jane\/presets\/plain-jane\/demo\/$/);
    assert.equal(result.products[1].preview_url,null);
  }finally{globalThis.fetch=original}
});
