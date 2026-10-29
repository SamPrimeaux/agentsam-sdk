import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const units=['general','agents','customize','design','git-prs','codebase',
  'network','runtime','themes','storage','keys','usage','notifications','docs','integrations'];
test('all hosted Settings routes are pre-rendered by canonical Nitro SSR at build-time',()=>{
 for(const unit of units){
  const source=path.join(root,'.output/public/studio-settings-shell',unit,'index.html');
  assert.ok(existsSync(source),'missing SSR shell: '+unit);
  const html=readFileSync(source,'utf8');
  assert.match(html,/^<!DOCTYPE html>/i);
  assert.match(html,/<script/);
  assert.ok(html.includes('/assets/'));
  assert.doesNotMatch(html,/password_hash|api_token|client_secret/i);
 }
});
test('Settings shell host is session-gated, read-only and stays on the current app origin',()=>{
 const worker=readFileSync(path.join(root,'backend/worker/index.js'),'utf8');
 const start=worker.indexOf('    // Settings are served as build-generated');
 const end=worker.indexOf('    // Gate authenticated Studio app routes',start);
 assert.ok(start>0 && end>start);
 const section=worker.slice(start,end);
 assert.match(section,/await resolveSessionUserId\(request,env\)/);
 assert.match(section,/Response.redirect\(url.origin\+LOGIN_PATH/);
 assert.match(section,/studio-settings-shell/);
 assert.match(section,/cache-control","private, no-store"/);
 assert.doesNotMatch(section,/env\.DB\.prepare/);
 assert.doesNotMatch(section,/run\(|INSERT INTO|UPDATE |DELETE FROM/);
 const stage=readFileSync(path.join(root,'scripts/stage-settings-shell.mjs'),'utf8');
 assert.match(stage,/nitro.fetch/);
 assert.match(stage,/No account data/);
});
