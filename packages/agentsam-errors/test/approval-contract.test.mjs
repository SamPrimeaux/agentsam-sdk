import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolError} from '../src/index.js';
test('approval-required and actual denial are separate canonical errors',()=>{
 const pending=createToolError({tool:'cloudflare.d1.schema',reason:'tool_approval_required',stage:'authorize',message:'Approval required'});
 const denied=createToolError({tool:'cloudflare.d1.schema',reason:'tool_permission_denied',stage:'authorize',message:'Denied'});
 assert.equal(pending.code,'FAILED_PRECONDITION');
 assert.equal(pending.envelope.resolution_owner,'user');
 assert.equal(pending.envelope.stage,'authorize');
 assert.equal(denied.code,'PERMISSION_DENIED');
 assert.equal(denied.envelope.resolution_owner,'policy');
});
