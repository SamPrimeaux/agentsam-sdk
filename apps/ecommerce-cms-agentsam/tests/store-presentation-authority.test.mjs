import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const scope={};
runInNewContext(readFileSync(new URL('../frontend/static/js/store-presentation.js',import.meta.url),'utf8'),{window:scope});
const choose=scope.cmsStorePresentation.chooseStorePresentation;
test('published site outvotes an unrelated unverified Heuristic starter',()=>{
  const site={site_id:'theme-store',status:'published',url:'https://themes.inneranimalmedia.com/',edit_href:'/admin/page-edit?site_id=theme-store'};
  const selected=choose({selected_site_id:'theme-store',site_preview:site,preview_theme:{id:'theme_heuristic',name:'Heuristic Starter'}});
  assert.equal(selected.kind,'site');
  assert.equal(selected.record.url,'https://themes.inneranimalmedia.com/');
});
test('rejects cross-site and untrusted public preview while preserving draft access',()=>{
  const theme={id:'saved_draft',edit_href:'/admin/theme-project-editor'};
  for(const site_preview of [
    {site_id:'another',status:'published',url:'https://example.com/'},
    {site_id:'theme-store',status:'draft',url:'https://themes.inneranimalmedia.com/'},
    {site_id:'theme-store',status:'published',url:'javascript:alert(1)'},
  ]) {
    const x=choose({selected_site_id:'theme-store',site_preview,preview_theme:theme});
    assert.equal(x.kind,'theme');assert.equal(x.record.id,theme.id);
  }
});
test('store loads the shared preview resolver before its first render and accepts site-owned page editing',()=>{
  const html=readFileSync(new URL('../frontend/static/store.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('/admin/js/store-presentation.js')<html.indexOf('/admin/js/store.js'));
  const js=readFileSync(new URL('../frontend/static/js/store.js',import.meta.url),'utf8');
  assert.match(js,/chooseStorePresentation\(d\)/);
  assert.match(js,/\/admin\/page-edit/);
});
