import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractRunnableHtml, buildBrowserInstruction, withBrowserAnnotationBridge } from '../frontend/src/components/workbench/browser-build-result.ts';
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

test('Chat and Work share one + picker, project chooser and real speech controls',()=>{
 const composer=read('../frontend/src/components/workbench/composer.tsx');
 const picker=read('../frontend/agentsam/PluginPicker.tsx');
 const voice=read('../frontend/src/components/workbench/voice-session.tsx');
 assert.match(composer,/<ProjectPicker chatId=\{targetId\} showTrigger=\{false\}/);
 assert.doesNotMatch(composer,/as-work-composer-under/);
 assert.match(composer,/onWebSearch=\{webSearch\}/);
 assert.match(composer,/onImage=\{\(\) => setImageMode\(true\)\}/);
 assert.match(composer,/onModeChange=\{mode => setRunMode\(targetId,mode\)\}/);
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
 assert.match(source,/as-browser-conversation-welcome/);
 assert.match(source,/as-browser-chat-composer/);
 assert.match(source,/showWindowbar=\{false\}/);
 assert.match(source,/showBuildToolbar=\{false\}/);
 assert.match(abs,/exploreHomeExtra\?: ReactNode/);
 assert.match(build,/mascot\?: ReactNode/);
});

test('Browser build uses one compact toolbar, inline conversation and preview rather than a floating activity console', () => {
 const browser=read('../frontend/src/components/workbench/browser.tsx');
 const abs=read('../../../packages/agentsam-abs/src/react/AgentSamAbsBrowser.tsx');
 const css=read('../frontend/src/components/workbench/browser-stage.css');
 assert.match(browser,/showWindowbar=\{false\}/);
 assert.match(browser,/showBuildToolbar=\{false\}/);
 assert.match(browser,/setPreviewOpen\(true\)/);
 assert.match(browser,/as-browser-chat-composer/);
 assert.doesNotMatch(browser,/<section className="as-browser-build-activity"/);
 assert.match(abs,/aria-label="Back"/);
 assert.match(abs,/aria-label="Forward"/);
 assert.match(css,/border-radius:17px/);
});

test('Browser build completion handles no selected project without crashing the response', () => {
 const source=read('../frontend/src/lib/work/store.ts');
 const send=source.slice(source.indexOf('send: async (targetId, targetKind, text, context) =>'));
 assert.doesNotMatch(send,/parentTitle \|\| project\.name/);
 assert.match(send,/parentTitle \|\| project\?\.name \|\| taskSummary/);
});

test('Browser annotation bridges isolated preview and proxied page elements', () => {
 const html=read('../frontend/src/components/workbench/browser-build-result.ts');
 const helper=read('../../../packages/agentsam-workbench/src/agent/MiniAgentSam.tsx');
 const css=read('../../../packages/agentsam-workbench/src/agent/mini-agentsam.css');
 assert.match(html,/annotation-selection/);
 assert.match(html,/annotation-mode/);
 assert.match(helper,/event\.source/);
 assert.match(helper,/frame\.getBoundingClientRect/);
 assert.match(css,/iframe:is\(\.as-web-browser-frame/);
});

test('Sandboxed HTML preview retains the generated page and a cooperative annotation bridge', () => {
 const page='<!doctype html><html><body><button>Save</button></body></html>';
 const bridged=withBrowserAnnotationBridge(page);
 assert.match(bridged,/annotation-selection/);
 assert.match(bridged,/annotation-mode/);
 assert.match(bridged,/<button>Save<\/button>/);
 assert.match(bridged,/<\/html>$/);
});
