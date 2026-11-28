import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BuiltinWidget,validReleaseWidgetConfiguration} from '../dist/widgets/index.js';

test('PR widget accepts live repository configuration and rejects copied snapshot fixtures',()=>{
 assert.equal(validReleaseWidgetConfiguration('pull-request-summary',{repository:'owner/repo',pullNumber:42}),true);
 assert.equal(validReleaseWidgetConfiguration('pull-request-summary',{snapshot:{repository:'owner/repo',number:42}}),false);
 assert.equal(validReleaseWidgetConfiguration('pull-request-summary',{repository:'https://evil.test',pullNumber:42}),false);
 const html=renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'pull-request-summary',configuration:{snapshot:{repository:'owner/repo',number:42}}}));
 assert.match(html,/Loading live GitHub data/);
 assert.doesNotMatch(html,/Pull request #42/);
});

test('release readiness requires a repository/ref and never renders historical snapshot totals',()=>{
 assert.equal(validReleaseWidgetConfiguration('release-readiness',{repository:'owner/repo',ref:'main'}),true);
 assert.equal(validReleaseWidgetConfiguration('release-readiness',{repository:'owner/repo',ref:'../secret'}),false);
 assert.equal(validReleaseWidgetConfiguration('release-readiness',{snapshot:{passed:13,total:13}}),false);
 const html=renderToStaticMarkup(createElement(BuiltinWidget,{widgetId:'release-readiness',configuration:{snapshot:{passed:13,total:13}}}));
 assert.match(html,/Loading live GitHub data/);
 assert.doesNotMatch(html,/13 \/ 13 passed/);
});
