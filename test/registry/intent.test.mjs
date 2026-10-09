import test from 'node:test';
import assert from 'node:assert/strict';
import { isStandaloneKnowledgeQuestion } from '../../src/agent/intent.js';

test('ordinary general questions skip expensive repo and tool setup',()=>{
 for(const q of ['What is HTML5?','Define a closure','Explain CSS grid','How does TCP work?'])
  assert.equal(isStandaloneKnowledgeQuestion(q),true,q);
});
test('repository work and coding requests keep the agent tool path',()=>{
 for(const q of ['What is wrong with our repo?','Explain this codebase','Build me an HTML5 homepage','Inspect my workspace','How does this function work?'])
  assert.equal(isStandaloneKnowledgeQuestion(q),false,q);
});
