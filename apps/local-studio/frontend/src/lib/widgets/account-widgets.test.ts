import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  loadAccountWidgets, installAccountWidget, updateAccountWidget, uninstallAccountWidget,
} from './account-widgets.ts';

const respond = (data: object, status = 200) =>
  new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('New Tab widget client uses one authenticated account-scoped API for read and mutations', async () => {
  const originalFetch = globalThis.fetch;
  const calls: {url: string; method: string; body: unknown; credentials: RequestCredentials | undefined}[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method || 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
      credentials: init?.credentials,
    });
    return respond({ok:true,widgets:[{key:'countdown',title:'Countdown',installed:false,availability:'ready'}]});
  };
  try {
    const widgets = await loadAccountWidgets('agentsam_stage');
    assert.equal(widgets[0]?.key,'countdown');
    await installAccountWidget('countdown');
    await updateAccountWidget('countdown',{pinned:true,sizeClass:'medium'});
    await uninstallAccountWidget('countdown');
    assert.deepEqual(calls.map(call=>call.method),['GET','POST','PATCH','DELETE']);
    assert.ok(calls.every(call=>call.credentials==='same-origin'));
    assert.equal(calls[0].url,'/api/widgets?surface=agentsam_stage');
    assert.deepEqual(calls[1].body,{key:'countdown',surface:'agentsam_stage'});
    assert.deepEqual(calls[2].body,{key:'countdown',surface:'agentsam_stage',pinned:true,sizeClass:'medium'});
  } finally {globalThis.fetch = originalFetch;}
});
test('widget client never reports failed installation as successful', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => respond({ok:false,error:'widget_not_ready'},409);
  try {await assert.rejects(installAccountWidget('quick-controls'),/widget_not_ready/);}
  finally {globalThis.fetch = originalFetch;}
});
test('New Tab hosts installed Workbench widgets and legacy route redirects there', async () => {
  const stage = await readFile(new URL('../../components/workbench/new-tab-stage.tsx',import.meta.url),'utf8');
  const widgets = await readFile(new URL('../../components/workbench/new-tab-widgets.tsx',import.meta.url),'utf8');
  const legacy = await readFile(new URL('../../routes/(apps)/admin/widgets.tsx',import.meta.url),'utf8');
  assert.match(stage,/<NewTabWidgets/);
  assert.match(widgets,/<BuiltinWidget widgetId=\{widget.key\}/);
  assert.match(widgets,/installAccountWidget\(widget.key\)/);
  assert.match(widgets,/uninstallAccountWidget\(widget.key\)/);
  assert.match(legacy,/openSideTab\("newtab"/);
  assert.match(legacy,/to: "\/admin\/agentsam"/);
  assert.doesNotMatch(legacy,/WidgetUtilitiesPage/);
});
