import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {createGoalGuruHttpTransport} from '../dist/contracts.js';
const manifest=JSON.parse(readFileSync(new URL('../agentsam.app.json',import.meta.url),'utf8'));
test('GoalGuru is named and exposes both app and Side Stage',()=>{
 assert.equal(manifest.id,'goalguru');
 assert.equal(manifest.package,'@inneranimalmedia/agentsam-goalguru');
 assert.deepEqual(manifest.surfaces,['standalone','side-stage']);
});
test('host transport scopes paths and uses host fetch without credential leakage',async()=>{
 let path='', credentials='';
 const request=createGoalGuruHttpTransport('/api/studio/living-plan',async(u,init)=>{path=u; credentials=init.credentials; return Response.json({ok:true})});
 await request('/goals');
 assert.equal(path,'/api/studio/living-plan/goals');
 assert.equal(credentials,'same-origin');
 assert.throws(()=>request('//evil.test'),/goalguru_invalid_path/);
 assert.throws(()=>createGoalGuruHttpTransport('https://evil.test'),/goalguru_same_origin_base_required/);
});
test('GoalGuru UI contains no host-global store or fixed endpoint',()=>{
 const src=readFileSync(new URL('../src/GoalGuruPanel.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(src,/useWorkStore|window\.|fetch\(|@\//);
 assert.doesNotMatch(src,/credentials\s*:/);
 assert.match(src,/onContinue/);
 assert.match(src,/request\(/);
});
test('GoalGuru renders independently of Local Studio in a server-side React host', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { GoalGuruPanel } = await import('../dist/index.js');
  const html = renderToStaticMarkup(createElement(GoalGuruPanel, {
    request: async () => Response.json({ goals: [], steps: [], ticketLinks: [] }),
    mode: 'page',
  }));
  assert.match(html, />Goals<\/h2>/);
  assert.match(html, /data-goalguru/);
  assert.match(html, /data-mode="page"/);
});
