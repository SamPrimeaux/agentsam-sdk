import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BuiltinWidget,readPullRequestSnapshot,readReleaseSnapshot,validReleaseWidgetConfiguration} from '../dist/widgets/index.js';
const observedAt='2026-11-26T20:00:00Z',commit='123abcd';
test('PR renderer is driven by a validated snapshot, not a sample number',()=>{
 const snapshot={repository:'owner/repo',number:42,title:'Fix',branch:'feat/fix',commit,state:'open',files:3,additions:12,deletions:4,scope:'pull-request',observedAt};
 assert.ok(readPullRequestSnapshot(snapshot));
 const html=renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'pull-request-summary',configuration:{snapshot}}));
 assert.match(html,/Pull request #42/);assert.match(html,/github.com\/owner\/repo\/pull\/42/);assert.match(html,/Recorded/);
 assert.equal(readPullRequestSnapshot({...snapshot,repository:'https://evil.test'}),null);
});
test('verification cards reject inconsistent totals and distinguish empty data',()=>{
 const snapshot={commit,observedAt,source:'Test runner',label:'Unit tests',passed:2,total:3,checks:[{name:'Build',status:'passed'}],blockers:['Merge conflict']};
 assert.ok(readReleaseSnapshot(snapshot));assert.equal(readReleaseSnapshot({...snapshot,passed:4}),null);
 const html=renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'release-readiness',configuration:{snapshot}}));
 assert.match(html,/2 \/ 3 passed/);assert.match(html,/Merge conflict/);assert.match(html,/Not a live release gate/);
 assert.match(renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'release-readiness'})),/No recorded test evidence/);
 assert.equal(validReleaseWidgetConfiguration('release-readiness',{snapshot,extra:true}),false);
});
