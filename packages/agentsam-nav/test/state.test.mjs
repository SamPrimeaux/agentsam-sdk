import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Nav, createNavState } from '../dist/index.js';

test('independent surfaces share one immutable navigation state without a browser singleton', () => {
  const stateStore = createNavState({desktopOpen:false});
  const other = createNavState();
  const snapshots = [];
  const unsubscribe = stateStore.subscribe(() => snapshots.push(stateStore.getSnapshot()));
  const initial = stateStore.getSnapshot();
  stateStore.setState({desktopOpen:true,width:320});
  const render = Surface => renderToString(React.createElement(Nav.Provider,{stateStore,resizable:true,value:{showHistory:false}},React.createElement(Surface)));
  assert.match(render(Nav.Sidenav), /data-open="true"/);
  assert.match(render(Nav.Topbar), /aria-expanded="true"/);
  assert.equal(stateStore.getSnapshot().width,320);
  assert.equal(initial.desktopOpen,false,'previous snapshot stays immutable');
  assert.equal(other.getSnapshot().width,264,'another installation stays independent');
  stateStore.setState({desktopOpen:true,width:320});
  assert.equal(snapshots.length,1,'no notification or unstable snapshot for an unchanged update');
  unsubscribe();
  stateStore.setState({width:1000});
  assert.equal(stateStore.getSnapshot().width,400);
  assert.equal(snapshots.length,1);
});

test('mobile drawer state is independent of the remembered desktop sidebar', () => {
  const store=createNavState({desktopOpen:true,isMobile:true});
  store.setState(state=>({mobileOpen:!state.mobileOpen}));
  assert.equal(store.getSnapshot().mobileOpen,true);
  assert.equal(store.getSnapshot().desktopOpen,true);
  store.setState({mobileOpen:false,width:NaN});
  assert.equal(store.getSnapshot().width,264);
  assert.equal(store.getSnapshot().desktopOpen,true);
});

test('a host can put Home before New chat without changing legacy consumers', () => {
  const value={destinations:[{id:'home',label:'Home',href:'/home'}],onCreateConversation:()=>{},showHistory:false};
  const render=v=>renderToString(React.createElement(Nav.Provider,{value:v},React.createElement(Nav.Sidenav)));
  const configured=render({...value,newConversationAfter:'home'});
  assert.ok(configured.indexOf('title="Home"')<configured.indexOf('title="New chat"'));
  const legacy=render(value);
  assert.ok(legacy.indexOf('title="New chat"')<legacy.indexOf('title="Home"'));
});
