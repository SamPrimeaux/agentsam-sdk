import test from 'node:test';
import assert from 'node:assert/strict';
import {execute,route,tools} from '../mcp/server.mjs';
test('actual nominal 2x4 dimension scope',()=>{
 const out=execute('arch.material.lookup',{nominal:'2x4',condition:'surfaced_dry'});
 assert.equal(out.actual.thickness_in,1.5);assert.equal(out.actual.width_in,3.5);assert.equal(out.actual.thickness_mm,38.1);assert.equal(out.actual.width_mm,88.9);
});
test('unsupported conditions never silently converted',()=>{
 assert.throws(()=>execute('arch.material.lookup',{nominal:'2x4'}));
 assert.throws(()=>execute('arch.material.lookup',{nominal:'6x6',condition:'surfaced_dry'}));
});
test('layers and negative thickness',()=>{
 assert.equal(execute('arch.assembly.thickness',{layers:[{name:'studs',thickness_in:5.5},{name:'board',thickness_in:0.5}]}).total_in,6);
 assert.throws(()=>execute('arch.assembly.thickness',{layers:[{name:'bad',thickness_in:-1}]}));
});
test('tolerance and gap',()=>{
 assert.equal(execute('arch.qa.compare_dimensions',{expected_in:40,measured_in:40.01,tolerance_in:0.02}).status,'pass');
 assert.equal(execute('arch.qa.compare_dimensions',{expected_in:40,measured_in:39,tolerance_in:0.02}).status,'fail');
});
test('references and truthful capabilities',()=>{
 assert(execute('arch.references.list',{}).sources.length>=8);
 assert(execute('arch.capabilities.status',{}).not_implemented.includes('design.bim.*'));
});
test('MCP initialize/list/call/error',()=>{
 assert.equal(route({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}}).result.serverInfo.name,'agentsam-architectural-knowledge');
 assert.equal(route({jsonrpc:'2.0',id:2,method:'tools/list'}).result.tools.length,5);
 const good=route({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'arch.material.lookup',arguments:{nominal:'2x4',condition:'surfaced_dry'}}});
 assert.equal(good.result.structuredContent.actual.width_in,3.5);
 assert.equal(route({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'bad',arguments:{}}}).result.isError,true);
});
