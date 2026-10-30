// Explicit optional-provider proof. Fails if the real host module is absent;
// it never silently skips or turns a mock easing into provider evidence.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import {createGSAPCreativeDispatcher} from '../../src/plugins/creative.js';
const path=process.argv[2];if(!path)throw new Error('Usage: node scripts/creative/verify-gsap.mjs /absolute/path/to/gsap.cjs');
const require=createRequire(import.meta.url),module=require(path),gsap=module.gsap||module;
assert.equal(gsap.version,'3.15.0');
const row={id:'test-install',account_id:'proof',plugin_key:'gsap-creative',is_enabled:1,config_json:'{"enabledModules":[]}'};
const db = {
 prepare() {
  return {bind() {return {all() {return {results: [row]};}};}};
 },
};
const invoke=createGSAPCreativeDispatcher({db,gsap});
const result=await invoke({tool:{tool_key:'gsap-creative.sample',handler_key:'gsap-creative.sample',plugin_id:'test-install'},args:{timeUs:500000,durationUs:1000000,ease:'power2.out'},context:{accountId:'proof'}});
assert.equal(result.value,.875);console.log(JSON.stringify({...result,proof:'real-GSAP-runtime',source:'greensock/GSAP@13e2b790546426a1a2e0e9b409f3f8dc6d6611f2'}));
