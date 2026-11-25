import test from 'node:test';
import assert from 'node:assert/strict';
import { startThemeGuidance } from '../frontend/theme-editor/theme-start.mjs';

for (const siteId of [undefined, 'site_one']) {
  test('new theme opens the actual editor assistant without auto-running inference: '+(siteId || 'account'), async () => {
    const calls=[];
    const drawer={};
    const doc={getElementById(id){return id==='agentsam-drawer'?drawer:null;}};
    const win={
      setAgentsamPageContext(value){calls.push(['context',value]);},
      openAgentsamDrawer(){calls.push(['open']);},
      sendAgentsamMessage(){throw new Error('unexpected automatic request');},
    };
    const opened=await startThemeGuidance({contentDocument:doc,contentWindow:win},{
      siteId,projectId:'theme_one',siteName:'Example',projectName:'New theme',
    });
    assert.equal(opened,true);
    assert.deepEqual(calls,[
      ['context',{surface:'ecommerce-cms-theme-studio',project_id:'theme_one',
        ...(siteId?{site_id:siteId,site_name:'Example'}:{}),project_name:'New theme',intent:'new_theme_guidance'}],
      ['open'],
    ]);
  });
}

test('opening the assistant waits for its actual mounted drawer', async()=>{
  const doc=new EventTarget();
  let drawer=null,opens=0;
  doc.getElementById=()=>drawer;
  const result=startThemeGuidance({contentDocument:doc,contentWindow:{openAgentsamDrawer(){opens++;}}},{projectId:'theme_one'});
  assert.equal(opens,0);
  drawer={};
  doc.dispatchEvent(new Event('agentsam:drawer-ready'));
  assert.equal(await result,true);
  assert.equal(opens,1);
});

test('missing project identity is rejected',async()=>{
  await assert.rejects(startThemeGuidance({contentDocument:{},contentWindow:{}}),/theme_start_identity_required/);
});
