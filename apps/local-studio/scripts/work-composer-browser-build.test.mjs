import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractRunnableHtml, buildBrowserInstruction } from '../frontend/src/components/workbench/browser-build-result.ts';
const here=dirname(fileURLToPath(import.meta.url));
const read=(path)=>readFileSync(resolve(here,path),'utf8');

test('browser Build accepts a complete executable preview, never plain prose or fragments',()=>{
 const html='<!doctype html><html><head><title>Test</title></head><body><button>Click</button></body></html>';
 assert.equal(extractRunnableHtml('Here it is:\n```html\n'+html+'\n```'),html);
 assert.equal(extractRunnableHtml(html),html);
 assert.equal(extractRunnableHtml('This is your proposal'),null);
 assert.equal(extractRunnableHtml('```html\n<div>Hello</div>\n```'),null);
 assert.equal(extractRunnableHtml('```html\n<html><body>Incomplete'),null);
});

test('browser Build instruction binds existing preview without silently mutating source',()=>{
 assert.match(buildBrowserInstruction('make a landing page'),/complete self-contained runnable HTML/);
 assert.match(buildBrowserInstruction('edit colors','<html><body>Old</body></html>'),/Preserve working functionality/);
});

test('browser Build uses the same tab and actual agent send, never drafts to lead chat',()=>{
 const source=read('../frontend/src/components/workbench/browser.tsx');
 assert.match(source,/await send\(tab\.id, 'side', buildBrowserInstruction\(request, source\), \{ runMode: 'agent' \}\)/);
 assert.match(source,/setBrowserSrcdoc\(tab\.id, html/);
 assert.doesNotMatch(source,/Added the request to your AgentSam chat composer/);
 assert.match(source,/onStop=\{\(\) => stop\(tab\.id\)\}/);
});

test('Work composer uses one + picker, separate project row and real speech controls',()=>{
 const composer=read('../frontend/src/components/workbench/composer.tsx');
 const picker=read('../frontend/agentsam/PluginPicker.tsx');
 const voice=read('../frontend/src/components/workbench/voice-session.tsx');
 assert.match(composer,/workMode && targetKind === 'chat' \? <div className="as-work-composer-under"/);
 assert.match(composer,/onWebSearch=\{workMode \? webSearch/);
 assert.match(composer,/onImage=\{workMode \? \(\) => setImageMode\(true\)/);
 assert.match(composer,/onModeChange=\{workMode \? mode => setRunMode\(targetId,mode\)/);
 assert.match(picker,/Add photos & files/);
 assert.match(picker,/Add from library/);
 assert.match(picker,/Work in a project/);
 assert.match(picker,/Plugins & apps/);
 assert.match(voice,/recognition\.onresult/);
 assert.match(voice,/useWorkStore\.getState\(\)\.send\(targetId, targetKind, transcript\)/);
 assert.match(voice,/SpeechSynthesisUtterance/);
});

test('Explore and Build welcome screens use the active companion via ABS slots',()=>{
 const source=read('../frontend/src/components/workbench/browser.tsx');
 const abs=read('../../../packages/agentsam-abs/src/react/AgentSamAbsBrowser.tsx');
 const build=read('../../../packages/agentsam-abs/src/react/AbsBuildHome.tsx');
 assert.match(source,/companionStateAsset\(companion, busy \? 'working' : 'idle'\)/);
 assert.match(source,/exploreHomeExtra=\{mascot\}/);
 assert.match(source,/<AbsBuildHome mascot=\{mascot\}/);
 assert.match(abs,/exploreHomeExtra\?: ReactNode/);
 assert.match(build,/mascot\?: ReactNode/);
});
