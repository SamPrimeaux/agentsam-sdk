import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
test('analytics kit exposes the real tool-usage API and read model',()=>{
 const contract=readFileSync(new URL('../src/contracts/index.ts',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/frontend/index.tsx',import.meta.url),'utf8');
 assert.match(contract, /"tool-usage": AgentSamToolUsageReadModel/);
 assert.match(contract, /source: "agentsam_tool_call_log"/);
 assert.match(page, /key: "tool-usage", label: "Tools"/);
 assert.match(page, /Tool success rate/);
});
