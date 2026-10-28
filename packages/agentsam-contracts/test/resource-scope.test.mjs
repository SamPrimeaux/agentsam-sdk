import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAgentResourceScopeV2,assertAccountResourceOwnerV2} from '../dist/resource-scope.js';
const principal={accountId:'account-1',authUserId:'user-1'};
test('account-first resource scope needs no project or workspace to work',()=>{
 const scope=resolveAgentResourceScopeV2(principal);
 assert.equal(scope.contract,'agentsam.resource-scope.v2');
 assert.equal(scope.accountId,'account-1');
 assert.equal(scope.projectId,undefined);
 assert.equal(scope.executionWorkspaceId,undefined);
 assert.doesNotThrow(()=>assertAccountResourceOwnerV2(scope,'account-1'));
});
test('execution workspace never changes authenticated owner',()=>{
 const scope=resolveAgentResourceScopeV2(principal,{projectId:'house',executionWorkspaceId:'ephemeral-lane'});
 assert.equal(scope.accountId,'account-1');
 assert.equal(scope.projectId,'house');
 assert.equal(scope.executionWorkspaceId,'ephemeral-lane');
 assert.throws(()=>assertAccountResourceOwnerV2(scope,'account-2'),/account_resource_forbidden/);
});
test('missing principal cannot provision anonymous ownership',()=>{
 assert.throws(()=>resolveAgentResourceScopeV2(null),/authenticated_account_required/);
});
