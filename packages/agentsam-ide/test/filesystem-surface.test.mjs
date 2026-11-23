import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentSamFilesystem } from '../dist/surface/index.js';

test('Files source remains a real Monaco workbench without an authorized provider',()=>{
  const html=renderToStaticMarkup(React.createElement(AgentSamFilesystem,{
    sourceId:'github',
    sources:[{
      id:'github',label:'GitHub',state:'disconnected',
      detail:'A GitHub account is not connected',
      connect:()=>{},
    }],
    onSourceSelect:()=>{},
  }));
  assert.match(html,/New file/);
  assert.match(html,/Connect GitHub/);
  assert.match(html,/Your editor is ready/);
  assert.match(html,/Commands/);
  assert.doesNotMatch(html,/window\.prompt/);
});

test('Existing untitled document is visible when the editor is remounted',()=>{
  const html=renderToStaticMarkup(React.createElement(AgentSamFilesystem,{
    sourceId:'local',
    sources:[{
      id:'local',label:'Local',state:'connected',workspaceId:'example',
      workspace:{
        list:async()=>[],read:async()=>{throw Error('unneeded')},
        write:async()=>({ok:false,code:'error',message:'unneeded'}),
        create:async()=>{throw Error('unneeded')},
        rename:async()=>{throw Error('unneeded')},
        delete:async()=>{},search:async()=>[],history:async()=>[],restore:async()=>{throw Error('unneeded')},
        configuration:{manualSave:true},
      },
    }],
    onSourceSelect:()=>{},
  }));
  assert.match(html,/New file/);
  assert.match(html,/Open file/);
});
