import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const sdkRoot=fileURLToPath(new URL('../../../',import.meta.url));

const pages=[
  'apps/local-studio/frontend/agentsam/agentsam-page.js',
  'apps/ecommerce-cms-agentsam/frontend/static/js/agentsam-page.js',
];
test('legacy and FNF AgentSam page forks never invent connected MCP servers on discovery failure',()=>{
  for(const page of pages){
    const code=readFileSync(resolve(sdkRoot,page),'utf8');
    assert.doesNotMatch(code,/FALLBACK_MCP_SERVERS/,page+' still injects invented servers');
    assert.match(code,/Array\.isArray\(data\.mcp_servers\) \? data\.mcp_servers : \[\]/,
      page+' must use server-confirmed inventory only');
    assert.match(code,/filter\(\(server\) => server\.connected === true\)/,
      page+' must restrict active connections to confirmed server state');
  }
});
