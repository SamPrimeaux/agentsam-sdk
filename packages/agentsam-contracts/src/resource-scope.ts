/**
 * AgentSam account-first resource authority v2.
 * A workspace is an OPTIONAL execution/collaboration context, never a required
 * provisioned ownership namespace for a user's personal AgentSam resources.
 * Server obtains principal from authenticated session/OAuth, never from caller input.
 */
import type {AgentPrincipal} from './identity';
export const AGENTSAM_RESOURCE_SCOPE_VERSION='agentsam.resource-scope.v2' as const;
export type AgentResourceScopeV2={
  contract:typeof AGENTSAM_RESOURCE_SCOPE_VERSION;
  accountId:string;
  authUserId:string;
  projectId?:string;
  executionWorkspaceId?:string;
};
export function resolveAgentResourceScopeV2(
  principal:AgentPrincipal|null,
  options:{projectId?:string|null;executionWorkspaceId?:string|null}={},
):AgentResourceScopeV2 {
  if(!principal?.accountId?.trim()||!principal.authUserId?.trim()){
    throw new Error('authenticated_account_required');
  }
  const valid=(v?:string|null)=>typeof v==='string'&&v.trim()?v.trim():undefined;
  return {
    contract:AGENTSAM_RESOURCE_SCOPE_VERSION,
    accountId:principal.accountId.trim(),authUserId:principal.authUserId.trim(),
    ...(valid(options.projectId)?{projectId:valid(options.projectId)}:{}),
    ...(valid(options.executionWorkspaceId)?{executionWorkspaceId:valid(options.executionWorkspaceId)}:{}),
  };
}
/**
 * Lookup still needs server-side owner verification, even if the user selects
 * a project or changes the current UI route. The workspace is never authority.
 */
export function assertAccountResourceOwnerV2(scope:AgentResourceScopeV2,recordAccountId:string){
  if(!scope?.accountId||!recordAccountId||scope.accountId!==recordAccountId){
    throw new Error('account_resource_forbidden');
  }
}
