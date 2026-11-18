import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThemeStudioAssistantContext } from '../frontend/static/js/theme-editor-assistant-context.mjs';

const selected = {
  sectionKey:'hero', page:'/about', siteId:'site_alpha',
  ownerSlug:'about', label:'Hero', fieldKey:'title',
  currentValue:'Welcome',linked:true
};

test('Theme Studio carries a site lookup hint but never claims an authenticated principal',()=>{
  const result=buildThemeStudioAssistantContext(selected);
  assert.deepEqual(result.context.selected_resource,{
    type:'section',id:'hero',label:'Hero',page:'/about',site_id:'site_alpha',surface:'theme-studio'
  });
  assert.equal(result.context.site_id,'site_alpha');
  assert.equal(result.context.surface,'theme-studio');
  assert.equal(result.context.workflow_key,'cms_section_review');
  assert.equal(result.selectionInfo.current_value,'Welcome');
  assert.equal(result.conversationKey,JSON.stringify(['site_alpha','/about','hero',null]));
  assert.equal('accountId' in result.context,false);
  assert.equal('authUserId' in result.context,false);
  assert.equal('authority' in result.context,false);
});

test('Selected block includes its parent section and isolated conversation context',()=>{
  const block=buildThemeStudioAssistantContext({
    ...selected,blockId:'buy-button',fieldKey:'buy-button.label'
  });
  assert.deepEqual(block.context.selected_resource,{
    type:'block',id:'buy-button',section_key:'hero',label:'Hero',
    page:'/about',site_id:'site_alpha',surface:'theme-studio'
  });
  assert.equal(block.selectionInfo.block,'buy-button');
  assert.equal(block.selectionInfo.field,'buy-button.label');
  assert.notEqual(block.conversationKey,buildThemeStudioAssistantContext(selected).conversationKey);
});

test('Shared header/footer is annotation, not edit authority, but retains site selection',()=>{
  const result=buildThemeStudioAssistantContext({
    ...selected,ownerSlug:'site',sectionKey:'site-header',fieldKey:null
  });
  assert.equal('selected_resource' in result.context,false);
  assert.equal(result.context.site_id,'site_alpha');
  assert.equal(result.context.annotation.id,'site-header');
  assert.equal(result.selectionInfo.request_type,'review selected section');
});

test('Unimported source cannot be presented as an authenticated editable section',()=>{
  const result=buildThemeStudioAssistantContext({...selected,linked:false});
  assert.equal(result.context.selected_resource,undefined);
  assert.equal(result.context.annotation.id,'hero');
});

test('Missing site fails before assistant transport; conversations are isolated by site',()=>{
  assert.throws(()=>buildThemeStudioAssistantContext({...selected,siteId:null}),/Choose an authorized CMS site/);
  assert.throws(()=>buildThemeStudioAssistantContext({...selected,siteId:'../../../etc'}),/Choose an authorized CMS site/);
  assert.throws(()=>buildThemeStudioAssistantContext({...selected,sectionKey:null}),/Choose a CMS section first/);
  const other=buildThemeStudioAssistantContext({...selected,siteId:'site_beta'});
  assert.notEqual(other.conversationKey,buildThemeStudioAssistantContext(selected).conversationKey);
});

test('Assistant selection text is bounded and never treated as a command',()=>{
  const result=buildThemeStudioAssistantContext({...selected,currentValue:'x'.repeat(4000)});
  assert.equal(result.selectionInfo.current_value.length,2000);
});
